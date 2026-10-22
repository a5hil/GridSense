/*!
 * @file      IMeter.h
 * @brief     Abstract AC Power Meter Interface for GridSense Edge Nodes
 * @details   Decouples the electrical sensor layer from the LoRa transmission stack.
 *            Supports 1x PZEM (Single-Phase Phase R live), 3x PZEM (Multi-Drop Modbus RTU),
 *            or SPI-based Polyphase Metering ICs (e.g. ATM90E32 / ATM90E36).
 * @project   GridSense - Enterprise ADMS Architecture
 */

#ifndef IMETER_H
#define IMETER_H

#include <Arduino.h>

enum PhaseId : uint8_t {
    PHASE_R = 0,
    PHASE_Y = 1,
    PHASE_B = 2
};

struct PhaseReading {
    float voltage;       // V (RMS)
    float current;       // A (RMS)
    float power;         // W (Active Power P)
    float frequency;     // Hz
    float pf;            // Power Factor (-1.0 to 1.0)
    float energy;        // kWh (Accumulated)
    bool  isValid;       // True if ADC/Modbus CRC was verified
    bool  isInstrumented;// True if measured by physical hardware; false if uninstrumented / synthetic
};

struct ThreePhaseReadings {
    PhaseReading phases[3];   // Index 0: R, 1: Y, 2: B
    float        neutralCurrent; // A (RMS measured or calculated vector sum)
    float        voltageUnbalancePct; // NEMA unbalance ratio: (max dev from avg / avg) * 100
    float        currentUnbalancePct;
    bool         isThreePhase;
    uint32_t     timestampMs;

    inline PhaseReading& r() { return phases[PHASE_R]; }
    inline PhaseReading& y() { return phases[PHASE_Y]; }
    inline PhaseReading& b() { return phases[PHASE_B]; }
    inline const PhaseReading& r() const { return phases[PHASE_R]; }
    inline const PhaseReading& y() const { return phases[PHASE_Y]; }
    inline const PhaseReading& b() const { return phases[PHASE_B]; }
};

class IMeter {
public:
    virtual ~IMeter() {}

    /**
     * @brief Initialize hardware serial ports, SPI buses, or ADC registers.
     */
    virtual bool begin() = 0;

    /**
     * @brief Poll meter readings across available phases.
     * @param out Reference to ThreePhaseReadings struct populated by driver.
     * @return true if primary phase reading succeeded.
     */
    virtual bool read(ThreePhaseReadings& out) = 0;

    /**
     * @brief Human-readable driver name for serial diagnostics.
     */
    virtual const char* getDriverName() const = 0;

    /**
     * @brief Number of physically instrumented phases on this pole (1 or 3).
     */
    virtual uint8_t getInstrumentedPhaseCount() const = 0;
};

#endif // IMETER_H
