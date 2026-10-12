/*!
 * @file      gridsense_packet.cpp
 * @brief     Implementation of Packet Deduplication and Protocol Framing
 */

#include "gridsense_packet.h"

PacketDeduplicator::PacketDeduplicator() : insertIndex(0) {
    for (uint8_t i = 0; i < CACHE_SIZE; i++) {
        cache[i].valid = false;
        cache[i].src = 0;
        cache[i].seq = 0;
        cache[i].timestamp_ms = 0;
    }
}

bool PacketDeduplicator::isDuplicate(uint8_t src, uint32_t seq) {
    uint32_t now = millis();
    for (uint8_t i = 0; i < CACHE_SIZE; i++) {
        if (cache[i].valid && cache[i].src == src && cache[i].seq == seq) {
            // Check if seen recently (within last 30 seconds)
            if (now - cache[i].timestamp_ms < 30000) {
                return true;
            }
        }
    }
    return false;
}

void PacketDeduplicator::record(uint8_t src, uint32_t seq) {
    cache[insertIndex].src = src;
    cache[insertIndex].seq = seq;
    cache[insertIndex].timestamp_ms = millis();
    cache[insertIndex].valid = true;
    insertIndex = (insertIndex + 1) % CACHE_SIZE;
}

void PacketDeduplicator::cleanup() {
    uint32_t now = millis();
    for (uint8_t i = 0; i < CACHE_SIZE; i++) {
        if (cache[i].valid && (now - cache[i].timestamp_ms >= 30000)) {
            cache[i].valid = false;
        }
    }
}

bool serializeGridPacket(const GridPacket& pkt, const char* telemetryFields, char* outBuf, size_t outSize) {
    if (!outBuf || outSize == 0) return false;

    // Constructs packet with Meshtastic-style routing header + sensor telemetry
    int written = snprintf(outBuf, outSize,
        "{\"src\":%d,\"rly\":%d,\"dst\":%d,\"seq\":%lu,\"ttl\":%d,\"type\":\"%s\",%s}",
        pkt.src, pkt.rly, pkt.dst, pkt.seq, pkt.ttl, pkt.type,
        telemetryFields ? telemetryFields : ""
    );

    return (written > 0 && (size_t)written < outSize);
}

// Lightweight JSON header extractor without external library dependencies
bool parseGridPacket(const char* jsonStr, GridPacket& pkt) {
    if (!jsonStr) return false;

    const char* pSrc = strstr(jsonStr, "\"src\":");
    const char* pRly = strstr(jsonStr, "\"rly\":");
    const char* pDst = strstr(jsonStr, "\"dst\":");
    const char* pSeq = strstr(jsonStr, "\"seq\":");
    const char* pTtl = strstr(jsonStr, "\"ttl\":");

    // Backward-compatibility: if "src" not found, check legacy "pole"
    if (!pSrc) {
        const char* pPole = strstr(jsonStr, "\"pole\":");
        if (pPole) {
            pkt.src = atoi(pPole + 7);
            pkt.rly = pkt.src;
            pkt.dst = ADDR_GATEWAY;
            pkt.seq = pSeq ? strtoul(pSeq + 6, nullptr, 10) : 0;
            pkt.ttl = DEFAULT_HOP_LIMIT;
            pkt.type = "TEL";
            return true;
        }
        return false;
    }

    pkt.src = atoi(pSrc + 6);
    pkt.rly = pRly ? atoi(pRly + 6) : pkt.src;
    pkt.dst = pDst ? atoi(pDst + 6) : ADDR_GATEWAY;
    pkt.seq = pSeq ? strtoul(pSeq + 6, nullptr, 10) : 0;
    pkt.ttl = pTtl ? atoi(pTtl + 6) : 1;
    pkt.type = "TEL";

    return true;
}
