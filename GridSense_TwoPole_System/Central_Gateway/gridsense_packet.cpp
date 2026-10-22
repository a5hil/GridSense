/*!
 * @file      gridsense_packet.cpp
 * @brief     GridSense Network Protocol Framing Implementation (GS2| & GS| support)
 * @project   GridSense - Enterprise ADMS Architecture
 */

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
    // Protocol v2 Format: GS2|<src>|<relay>|<dest>|<seq>|<hopLimit>|<hopsTaken>|<msgType>|<phaseMask>|<payload>
    uint8_t pmask = (pkt.header.phaseMask == 0) ? PHASE_MASK_R : pkt.header.phaseMask;

    int written = snprintf(outBuf, maxLen,
        "GS2|%u|%u|%u|%u|%u|%u|%u|%u|%s",
        pkt.header.srcId,
        pkt.header.relayId,
        pkt.header.destId,
        pkt.header.seq,
        pkt.header.hopLimit,
        pkt.header.hopsTaken,
        pkt.header.msgType,
        pmask,
        pkt.payload
    );
    return (written > 0 && (size_t)written < maxLen);
}

bool deserializeGridSensePacket(const char* inBuf, GridSensePacket& outPkt) {
    if (!inBuf) return false;

    // 1. Check for Protocol v2 ("GS2|...")
    if (strncmp(inBuf, "GS2|", 4) == 0) {
        const char* ptr = inBuf + 4;
        unsigned int src = 0, relay = 0, dest = 0, seq = 0, hopLim = 0, hops = 0, type = 0, mask = 0;

        int n = sscanf(ptr, "%u|%u|%u|%u|%u|%u|%u|%u|", &src, &relay, &dest, &seq, &hopLim, &hops, &type, &mask);
        if (n < 8) return false;

        outPkt.header.protoVer  = 2;
        outPkt.header.srcId     = (uint8_t)src;
        outPkt.header.relayId   = (uint8_t)relay;
        outPkt.header.destId    = (uint8_t)dest;
        outPkt.header.seq       = (uint16_t)seq;
        outPkt.header.hopLimit  = (uint8_t)hopLim;
        outPkt.header.hopsTaken = (uint8_t)hops;
        outPkt.header.msgType   = (uint8_t)type;
        outPkt.header.phaseMask = (uint8_t)mask;

        // Locate 8th pipe delimiter to extract payload
        int pipes = 0;
        while (*ptr) {
            if (*ptr == '|') {
                pipes++;
                if (pipes == 8) {
                    ptr++;
                    break;
                }
            }
            ptr++;
        }

        if (pipes < 8) {
            outPkt.payload[0] = '\0';
            return false;
        }

        strncpy(outPkt.payload, ptr, sizeof(outPkt.payload) - 1);
        outPkt.payload[sizeof(outPkt.payload) - 1] = '\0';
        return true;
    }

    // 2. Check for Legacy Protocol v1 ("GS|...")
    if (strncmp(inBuf, "GS|", 3) == 0) {
        const char* ptr = inBuf + 3;
        unsigned int src = 0, relay = 0, dest = 0, seq = 0, hopLim = 0, hops = 0, type = 0;

        int n = sscanf(ptr, "%u|%u|%u|%u|%u|%u|%u|", &src, &relay, &dest, &seq, &hopLim, &hops, &type);
        if (n < 7) return false;

        outPkt.header.protoVer  = 1;
        outPkt.header.srcId     = (uint8_t)src;
        outPkt.header.relayId   = (uint8_t)relay;
        outPkt.header.destId    = (uint8_t)dest;
        outPkt.header.seq       = (uint16_t)seq;
        outPkt.header.hopLimit  = (uint8_t)hopLim;
        outPkt.header.hopsTaken = (uint8_t)hops;
        outPkt.header.msgType   = (uint8_t)type;
        outPkt.header.phaseMask = PHASE_MASK_R; // Legacy single-phase default

        // Locate 7th pipe delimiter to extract payload
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

    return false;
}
