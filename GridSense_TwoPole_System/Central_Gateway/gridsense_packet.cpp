#include "gridsense_packet.h"

PacketDeduplicator::PacketDeduplicator() {
    clear();
}

void PacketDeduplicator::clear() {
    for (size_t i = 0; i < CAPACITY; i++) {
        entries[i].srcId = 0;
        entries[i].seq = 0;
        entries[i].seenTimeMs = 0;
    }
    head = 0;
}

bool PacketDeduplicator::isDuplicate(uint8_t srcId, uint16_t seq) {
    uint32_t now = millis();
    for (size_t i = 0; i < CAPACITY; i++) {
        if (entries[i].srcId == srcId && entries[i].seq == seq) {
            if (now - entries[i].seenTimeMs < 30000) {
                return true;
            }
        }
    }
    return false;
}

void PacketDeduplicator::record(uint8_t srcId, uint16_t seq) {
    entries[head].srcId = srcId;
    entries[head].seq = seq;
    entries[head].seenTimeMs = millis();
    head = (head + 1) % CAPACITY;
}

bool serializeGridSensePacket(const GridSensePacket& pkt, char* outBuf, size_t maxLen) {
    // Format: GS|<src>|<relay>|<dest>|<seq>|<hopLimit>|<hopsTaken>|<msgType>|<payload>
    int written = snprintf(outBuf, maxLen,
        "GS|%u|%u|%u|%u|%u|%u|%u|%s",
        pkt.header.srcId,
        pkt.header.relayId,
        pkt.header.destId,
        pkt.header.seq,
        pkt.header.hopLimit,
        pkt.header.hopsTaken,
        pkt.header.msgType,
        pkt.payload
    );
    return (written > 0 && (size_t)written < maxLen);
}

bool deserializeGridSensePacket(const char* inBuf, GridSensePacket& outPkt) {
    if (!inBuf || strncmp(inBuf, "GS|", 3) != 0) {
        return false;
    }

    const char* ptr = inBuf + 3;
    unsigned int src = 0, relay = 0, dest = 0, seq = 0, hopLim = 0, hops = 0, type = 0;

    int n = sscanf(ptr, "%u|%u|%u|%u|%u|%u|%u|", &src, &relay, &dest, &seq, &hopLim, &hops, &type);
    if (n < 7) {
        return false;
    }

    outPkt.header.srcId     = (uint8_t)src;
    outPkt.header.relayId   = (uint8_t)relay;
    outPkt.header.destId    = (uint8_t)dest;
    outPkt.header.seq       = (uint16_t)seq;
    outPkt.header.hopLimit  = (uint8_t)hopLim;
    outPkt.header.hopsTaken = (uint8_t)hops;
    outPkt.header.msgType   = (uint8_t)type;

    // Locate the 7th delimiter '|' to find payload
    int pipes = 0;
    while (*ptr) {
        if (*ptr == '|') {
            pipes++;
            if (pipes == 7) {
                ptr++;
                break;
            }
        }
        ptr++;
    }

    if (pipes < 7) {
        outPkt.payload[0] = '\0';
        return false;
    }

    strncpy(outPkt.payload, ptr, sizeof(outPkt.payload) - 1);
    outPkt.payload[sizeof(outPkt.payload) - 1] = '\0';
    return true;
}
