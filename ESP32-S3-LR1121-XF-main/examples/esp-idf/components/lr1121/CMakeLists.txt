file(GLOB_RECURSE SRC_FILES *.c
                            lr1121_printers/*.c
                            lr1121_modem/*.c 
                            lr1121_common/*.c
                            lr11xx_driver/*.c
)

set(include_dirs 
   . 
   lr1121_printers
   lr1121_modem
   lr1121_common
   lr11xx_driver
)


idf_component_register(SRCS ${SRC_FILES}
                        INCLUDE_DIRS ${include_dirs}
                        REQUIRES driver gpio spi esp_timer
                    )
