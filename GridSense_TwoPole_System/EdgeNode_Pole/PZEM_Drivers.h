/*!
 * @file      PZEM_Drivers.h
 * @brief     Concrete AC Power Meter Drivers implementing IMeter for GridSense Edge Nodes
 * @details   Provides:
 *            1. SinglePZEMMeter: Single physical PZEM-004T on Phase R (Y & B uninstrumented)
 *            2. MultiPZEMMeter:  3x PZEM-004T multi-drop Modbus on shared UART (0x01, 0x02, 0x03)
 *            3. Mock3PhaseMeter: High-fidelity 3-phase synthesizer for bench evaluation
 * @project   GridSense - Enterprise ADMS Architecture
 */

#ifndef PZEM_DRIVERS_H
#define PZEM_DRIVERS_H

#include "IMeter.h"
#include "PZEM004T_Modbus.h"
#include <math.h>

/* =========================================================================
 * 1. SinglePZEMMeter (Single-Phase Hardware Live - Phase R Only)
 * ========================================================================= */
class SinglePZEMMeter : public IMeter {
public:
    SinglePZEMMeter(HardwareSerial& port, int8_t rxPin, int8_t txPin, uint8_t addr = 0xF8)
        : _pzem(port, rxPin, txPin, addr) {}

    bool begin() override {
        _pzem.begin();
        return true;
    }

    bool read(ThreePhaseReadings& out) override {
        PZEMData data;
        bool ok = _pzem.read(data);

        out.timestampMs = millis();
        out.isThreePhase = false;

        // Phase R: Measured directly from physical PZEM-004T
        out.r().voltage        = data.isValid ? data.voltage   : 0.0f;
        out.r().current        = data.isValid ? data.current   : 0.0f;
        out.r().power          = data.isValid ? data.power     : 0.0f;
        out.r().frequency      = data.isValid ? data.frequency : 50.0f;
        out.r().pf             = data.isValid ? data.pf        : 0.96f;
        out.r().energy         = data.isValid ? data.energy    : 0.0f;
        out.r().isValid        = data.isValid;
        out.r().isInstrumented = true; // Physical hardware

        // Phase Y & Phase B: Cleanly flagged as UNINSTRUMENTED
        for (int p = 1; p < 3; p++) {
            out.phases[p].voltage        = 0.0f;
            out.phases[p].current        = 0.0f;
            out.phases[p].power          = 0.0f;
            out.phases[p].frequency      = 50.0f;
            out.phases[p].pf             = 0.0f;
            out.phases[p].energy         = 0.0f;
            out.phases[p].isValid        = false;
            out.phases[p].isInstrumented = false; // NOT physically instrumented
        }

        out.neutralCurrent      = out.r().current;
        out.voltageUnbalancePct = 0.0f;
        out.currentUnbalancePct = 0.0f;

        return ok;
    }

    const char* getDriverName() const override {
        return "Single-Phase PZEM-004T (Phase R Live)";
    }

    uint8_t getInstrumentedPhaseCount() const override {
        return 1;
    }

    PZEM004T_Modbus& getModbus() { return _pzem; }

private:
    PZEM004T_Modbus _pzem;
};

/* =========================================================================
 * 2. MultiPZEMMeter (3x PZEM-004T Multi-Drop Modbus on Shared UART)
 * ========================================================================= */
class MultiPZEMMeter : public IMeter {
public:
    MultiPZEMMeter(HardwareSerial& port, int8_t rxPin, int8_t txPin,
                   uint8_t addrR = 0x01, uint8_t addrY = 0x02, uint8_t addrB = 0x03)
        : _pzem(port, rxPin, txPin, addrR), _addrR(addrR), _addrY(addrY), _addrB(addrB) {}

    bool begin() override {
        _pzem.begin();
        return true;
    }

    bool read(ThreePhaseReadings& out) override {
        out.timestampMs = millis();
        out.isThreePhase = true;

        uint8_t addrs[3] = { _addrR, _addrY, _addrB };
        bool anySuccess = false;

        for (uint8_t p = 0; p < 3; p++) {
            PZEMData data;
            bool ok = _pzem.readFrom(addrs[p], data);
            delay(15); // Standard Modbus inter-frame quiet interval

            out.phases[p].voltage        = ok ? data.voltage   : 0.0f;
            out.phases[p].current        = ok ? data.current   : 0.0f;
            out.phases[p].power          = ok ? data.power     : 0.0f;
            out.phases[p].frequency      = ok ? data.frequency : 50.0f;
            out.phases[p].pf             = ok ? data.pf        : 0.96f;
            out.phases[p].energy         = ok ? data.energy    : 0.0f;
            out.phases[p].isValid        = ok;
            out.phases[p].isInstrumented = true;

            if (ok) anySuccess = true;
        }

        // Calculate NEMA Voltage Unbalance Ratio: (max deviation from avg / avg) * 100
        float vAvg = (out.r().voltage + out.y().voltage + out.b().voltage) / 3.0f;
        if (vAvg > 10.0f) {
            float maxDevV = fmaxf(fabsf(out.r().voltage - vAvg),
                            fmaxf(fabsf(out.y().voltage - vAvg),
                                  fabsf(out.b().voltage - vAvg)));
            out.voltageUnbalancePct = (maxDevV / vAvg) * 100.0f;
        } else {
            out.voltageUnbalancePct = 0.0f;
        }

        // Calculate Current Unbalance Ratio
        float iAvg = (out.r().current + out.y().current + out.b().current) / 3.0f;
        if (iAvg > 0.05f) {
            float maxDevI = fmaxf(fabsf(out.r().current - iAvg),
                            fmaxf(fabsf(out.y().current - iAvg),
                                  fabsf(out.b().current - iAvg)));
            out.currentUnbalancePct = (maxDevI / iAvg) * 100.0f;
        } else {
            out.currentUnbalancePct = 0.0f;
        }

        // Calculate Vector Neutral Current for 120-degree balanced phase displacement:
        // In = sqrt(Ir^2 + Iy^2 + Ib^2 - Ir*Iy - Iy*Ib - Ib*Ir)
        float ir = out.r().current;
        float iy = out.y().current;
        float ib = out.b().current;
        float neutralSq = (ir * ir) + (iy * iy) + (ib * ib) - (ir * iy) - (iy * ib) - (ib * ir);
        out.neutralCurrent = (neutralSq > 0.0f) ? sqrtf(neutralSq) : 0.0f;

        return anySuccess;
    }

    const char* getDriverName() const override {
        return "3-Phase Multi-Drop Modbus (PZEM-004T x3)";
    }

    uint8_t getInstrumentedPhaseCount() const override {
        return 3;
    }

    PZEM004T_Modbus& getModbus() { return _pzem; }

private:
    PZEM004T_Modbus _pzem;
    uint8_t _addrR;
    uint8_t _addrY;
    uint8_t _addrB;
};

/* =========================================================================
 * 3. Mock3PhaseMeter (Bench-Validation 3-Phase Synthesizer)
 * ========================================================================= */
enum Mock3PhaseScenario {
    MOCK3P_NORMAL = 0,
    MOCK3P_DIFFERENTIAL_FAULT, // Phase R leakage tap
    MOCK3P_BROKEN_CONDUCTOR,   // Phase Y conductor snap
    MOCK3P_BROKEN_NEUTRAL,     // Neutral floating (180V / 270V / 235V)
    MOCK3P_OVERCURRENT,        // 3-phase overload > 16A
    MOCK3P_POWERCUT,           // Feeder blackout (0V / 0A)
    MOCK3P_AUTO_CYCLE
};

class Mock3PhaseMeter : public IMeter {
public:
    Mock3PhaseMeter(uint8_t poleId)
        : _poleId(poleId), _scenario(MOCK3P_NORMAL), _cycleCount(0), _energyWh(1420.0f) {}

    bool begin() override {
        return true;
    }

    void setScenario(Mock3PhaseScenario s) {
        _scenario = s;
    }

    Mock3PhaseScenario getScenario() const {
        return _scenario;
    }

    bool read(ThreePhaseReadings& out) override {
        out.timestampMs = millis();
        out.isThreePhase = true;
        _energyWh += 0.5f;

        Mock3PhaseScenario active = _scenario;
        if (_scenario == MOCK3P_AUTO_CYCLE) {
            _cycleCount++;
            uint32_t step = _cycleCount % 24;
            if (step >= 8 && step <= 11) {
                active = MOCK3P_DIFFERENTIAL_FAULT;
            } else if (step >= 16 && step <= 18) {
                active = MOCK3P_BROKEN_CONDUCTOR;
            } else if (step >= 20 && step <= 21) {
                active = MOCK3P_BROKEN_NEUTRAL;
            } else {
                active = MOCK3P_NORMAL;
            }
        }

        float vBase = 230.0f + ((rand() % 10) - 5) * 0.1f;
        float freq  = 50.0f + ((rand() % 6) - 3) * 0.02f;

        switch (active) {
            case MOCK3P_DIFFERENTIAL_FAULT:
                // Inter-pole Phase R leakage: Pole 1 has 3.85A, Pole 2 has 1.15A
                out.r().voltage = vBase - ((_poleId == 1) ? 2.0f : 4.0f);
                out.r().current = (_poleId == 1) ? (3.85f + (rand() % 10) * 0.01f)
                                                 : (1.15f + (rand() % 10) * 0.01f);
                out.r().power   = out.r().voltage * out.r().current * 0.95f;
                out.r().pf      = 0.95f;

                // Phases Y & B balanced healthy
                out.y().voltage = vBase - 1.0f;
                out.y().current = 2.40f;
                out.y().power   = out.y().voltage * out.y().current * 0.96f;
                out.y().pf      = 0.96f;

                out.b().voltage = vBase - 1.5f;
                out.b().current = 2.35f;
                out.b().power   = out.b().voltage * out.b().current * 0.96f;
                out.b().pf      = 0.96f;
                break;

            case MOCK3P_BROKEN_CONDUCTOR:
                // Phase Y conductor snaps downstream: Pole 1 sees healthy voltage, Pole 2 sees 0V
                out.r().voltage = vBase;
                out.r().current = 2.45f;
                out.r().power   = out.r().voltage * out.r().current * 0.96f;
                out.r().pf      = 0.96f;

                out.y().voltage = (_poleId == 1) ? vBase : 0.0f;
                out.y().current = (_poleId == 1) ? 0.02f : 0.0f;
                out.y().power   = 0.0f;
                out.y().pf      = 0.0f;

                out.b().voltage = vBase;
                out.b().current = 2.40f;
                out.b().power   = out.b().voltage * out.b().current * 0.96f;
                out.b().pf      = 0.96f;
                break;

            case MOCK3P_BROKEN_NEUTRAL:
                // Neutral shift creates extreme phase voltage spread (180V / 270V / 235V)
                out.r().voltage = 180.0f + (rand() % 10) * 0.2f;
                out.r().current = 1.95f;
                out.r().power   = out.r().voltage * out.r().current * 0.91f;
                out.r().pf      = 0.91f;

                out.y().voltage = 268.0f + (rand() % 10) * 0.2f;
                out.y().current = 2.85f;
                out.y().power   = out.y().voltage * out.y().current * 0.94f;
                out.y().pf      = 0.94f;

                out.b().voltage = 234.0f + (rand() % 10) * 0.2f;
                out.b().current = 2.40f;
                out.b().power   = out.b().voltage * out.b().current * 0.95f;
                out.b().pf      = 0.95f;
                break;

            case MOCK3P_OVERCURRENT:
                for (int p = 0; p < 3; p++) {
                    out.phases[p].voltage = vBase - 7.0f;
                    out.phases[p].current = 18.2f + (p * 0.4f);
                    out.phases[p].power   = out.phases[p].voltage * out.phases[p].current * 0.97f;
                    out.phases[p].pf      = 0.97f;
                }
                break;

            case MOCK3P_POWERCUT:
                for (int p = 0; p < 3; p++) {
                    out.phases[p].voltage = 0.0f;
                    out.phases[p].current = 0.0f;
                    out.phases[p].power   = 0.0f;
                    out.phases[p].pf      = 0.0f;
                }
                freq = 0.0f;
                break;

            case MOCK3P_NORMAL:
            default:
                // Healthy balanced 3-phase Indian LT distribution (415V LL / 230V LN)
                out.r().voltage = vBase - ((_poleId == 2) ? 0.3f : 0.0f);
                out.r().current = (_poleId == 1) ? 2.45f : 2.43f;
                out.r().power   = out.r().voltage * out.r().current * 0.96f;
                out.r().pf      = 0.96f;

                out.y().voltage = vBase + 0.4f - ((_poleId == 2) ? 0.3f : 0.0f);
                out.y().current = (_poleId == 1) ? 2.40f : 2.38f;
                out.y().power   = out.y().voltage * out.y().current * 0.96f;
                out.y().pf      = 0.96f;

                out.b().voltage = vBase - 0.2f - ((_poleId == 2) ? 0.3f : 0.0f);
                out.b().current = (_poleId == 1) ? 2.38f : 2.36f;
                out.b().power   = out.b().voltage * out.b().current * 0.95f;
                out.b().pf      = 0.95f;
                break;
        }

        for (int p = 0; p < 3; p++) {
            out.phases[p].frequency      = freq;
            out.phases[p].energy         = _energyWh;
            out.phases[p].isValid        = true;
            out.phases[p].isInstrumented = true;
        }

        // Unbalance & Neutral calculations
        float vAvg = (out.r().voltage + out.y().voltage + out.b().voltage) / 3.0f;
        if (vAvg > 10.0f) {
            float maxDevV = fmaxf(fabsf(out.r().voltage - vAvg),
                            fmaxf(fabsf(out.y().voltage - vAvg),
                                  fabsf(out.b().voltage - vAvg)));
            out.voltageUnbalancePct = (maxDevV / vAvg) * 100.0f;
        } else {
            out.voltageUnbalancePct = 0.0f;
        }

        float ir = out.r().current;
        float iy = out.y().current;
        float ib = out.b().current;
        float neutralSq = (ir * ir) + (iy * iy) + (ib * ib) - (ir * iy) - (iy * ib) - (ib * ir);
        out.neutralCurrent = (neutralSq > 0.0f) ? sqrtf(neutralSq) : 0.0f;

        return true;
    }

    const char* getDriverName() const override {
        return "3-Phase Mock Polyphase Synthesizer";
    }

    uint8_t getInstrumentedPhaseCount() const override {
        return 3;
    }

private:
    uint8_t _poleId;
    Mock3PhaseScenario _scenario;
    uint32_t _cycleCount;
    float _energyWh;
};

#endif // PZEM_DRIVERS_H
