file(GLOB_RECURSE srcs *.c
                   examples/lr1121_cad/*.c
                   examples/lr1121_firmware_update/*.c
                   examples/lr1121_per/*.c
                   examples/lr1121_ping_pong/*.c
                   examples/lr1121_lora_frag/*.c
                   examples/lr1121_lr_fhss/*.c
                   examples/lr1121_read/*.c
                   examples/lr1121_sigfox/*.c
                   examples/lr1121_spectral_scan/*.c
                   examples/lr1121_spetrum_display/*.c
                   examples/lr1121_tx_cw/*.c
                   examples/lr1121_tx_infinite_preamble/*.c
                   examples/lr1121_write/*.c
                   examples/lr1121_LoRaWAN/*.c
                   )

set(include_dirs 
    . 
    examples/lr1121_cad
    examples/lr1121_firmware_update
    examples/lr1121_per
    examples/lr1121_ping_pong
    examples/lr1121_lora_frag
    examples/lr1121_lr_fhss
    examples/lr1121_read
    examples/lr1121_sigfox
    examples/lr1121_spectral_scan
    examples/lr1121_spetrum_display
    examples/lr1121_tx_cw
    examples/lr1121_tx_infinite_preamble
    examples/lr1121_write
    examples/lr1121_LoRaWAN
   )

idf_component_register(
    SRCS ${srcs}
    INCLUDE_DIRS ${include_dirs})

# add_compile_definitions(LR1121_CAD)
 add_compile_definitions(LR1121_FIRMWARE_UPDATE LR1121_TRANSCEIVER_0101) #LR1121_MODEM_05020001 LR1121_TRANSCEIVER_0101
# add_compile_definitions(LR1121_PER)
# add_compile_definitions(LR1121_PING_PONG)
# add_compile_definitions(LR1121_LORA_FRAG)
# add_compile_definitions(LR1121_LR_FHSS)
# add_compile_definitions(LR1121_READ)
# add_compile_definitions(LR1121_WRITE)
# add_compile_definitions(LR1121_SIGFOX)
# add_compile_definitions(LR1121_SPECTRAL_SCAN)
# add_compile_definitions(LR1121_SPETRUM_DISPLAY)
# add_compile_definitions(LR1121_TX_CW)
# add_compile_definitions(LR1121_TX_INFINITE_PRERMBLE)
# add_compile_definitions(LR1121_LORAWAN)

