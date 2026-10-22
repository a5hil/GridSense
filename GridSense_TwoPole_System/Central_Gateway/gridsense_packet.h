/*!
 * @file      gridsense_packet.h
 * @brief     GridSense Network Protocol Framing (v1 Legacy GS| & v2 Multi-Phase GS2|)
 * @project   GridSense - Enterprise ADMS Architecture
 */

#pragma once
#include <Arduino.h>

enum GridSenseMsgType : uint8_t {
    MSG_TYPE_TELEMETRY   = 0x01,
    MSG_TYPE_FAULT_ALERT = 0x02,
    MSG_TYPE_HEARTBEAT   = 0x03,
    MSG_TYPE_LAST_GASP   = 0x04
};

// Phase bitmask flags for Protocol v2
#define PHASE_MASK_R        0x01 // Bit 0: Phase R instrumented
#define PHASE_MASK_Y        0x02 // Bit 1: Phase Y instrumented
#define PHASE_MASK_B        0x04 // Bit 2: Phase B instrumented
#define PHASE_MASK_NEUTRAL  0x08 // Bit 3: Neutral conductor instrumented
#define PHASE_MASK_3PHASE   0x07 // R + Y + B
#define PHASE_MASK_4WIRE    0x0F // R + Y + B + N

struct GridSenseHeader {
    uint8_t  srcId;       // Originating Pole ID (1, 2, ...)
    uint8_t  relayId;     // Node forwarding this packet
    uint8_t  destId;      // Target (0x00 = Gateway, 0xFF = Broadcast)
    uint16_t seq;         // Originator sequence number
    uint8_t  hopLimit;    // TTL (decremented each hop)
    uint8_t  hopsTaken;   // Hops traversed (starts at 0)
    uint8_t  msgType;     // GridSenseMsgType
    uint8_t  phaseMask;   // Bitmask of instrumented phases (Protocol v2)
    uint8_t  protoVer;    // Protocol version: 1 for GS|, 2 for GS2|
};

struct GridSensePacket {
    GridSenseHeader header;
    char payload[256];    // Inner payload (Plaintext JSON or AES-128 Ciphertext)
};

class PacketDeduplicator {
public:
    PacketDeduplicator();
    bool isDuplicate(uint8_t srcId, uint16_t seq);
    void record(uint8_t srcId, uint16_t seq);
    void clear();

private:
    struct SeenEntry {
        uint8_t  srcId;
        uint16_t seq;
        uint32_t seenTimeMs;
    };
    static const size_t CAPACITY = 32;
    SeenEntry entries[CAPACITY];
    size_t head = 0;
};

// Pack & Unpack helpers (Protocol v2 default with v1 backwards compatibility)
bool serializeGridSensePacket(const GridSensePacket& pkt, char* outBuf, size_t maxLen);
bool deserializeGridSensePacket(const char* inBuf, GridSensePacket& outPkt);
