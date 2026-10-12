#pragma once
#include <Arduino.h>

enum GridSenseMsgType : uint8_t {
    MSG_TYPE_TELEMETRY   = 0x01,
    MSG_TYPE_FAULT_ALERT = 0x02,
    MSG_TYPE_HEARTBEAT   = 0x03,
    MSG_TYPE_LAST_GASP   = 0x04
};

struct GridSenseHeader {
    uint8_t  srcId;       // Originating Pole ID (1, 2, ...)
    uint8_t  relayId;     // Node forwarding this packet
    uint8_t  destId;      // Target (0x00 = Gateway, 0xFF = Broadcast)
    uint16_t seq;         // Originator sequence number
    uint8_t  hopLimit;    // TTL (decremented each hop)
    uint8_t  hopsTaken;   // Hops traversed (starts at 0)
    uint8_t  msgType;     // GridSenseMsgType
};

struct GridSensePacket {
    GridSenseHeader header;
    char payload[160];    // Inner JSON payload
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

// Pack & Unpack helpers
bool serializeGridSensePacket(const GridSensePacket& pkt, char* outBuf, size_t maxLen);
bool deserializeGridSensePacket(const char* inBuf, GridSensePacket& outPkt);
