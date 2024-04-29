#!/usr/bin/env python3

import os
import re
import dds
import json
import time 
from evdev import InputDevice, categorize, ecodes
from logger.custom_logger import CustomLogger
 
LONG_PRESS_THRESHOLD = 1.70 # seconds
KEY_POWER = 116
KEY_STOP = 128
#KEY_DOOR = 134 #DOOR SENSOR


gpio_dds_publisher = dds.publisher('device/x1plus')
gpio_log = CustomLogger("gpiokeys", "/tmp/gpiokeys.log",500000,1)  

def send_dds(name, press_type):
    dds_payload = json.dumps({
        "gpio": {
            "button": name,
            "event": press_type
        }
    })
    gpio_dds_publisher(dds_payload)

class Button:
    def __init__(self, scancode, name):
        self.pressed = None
        self.scancode = scancode
        self.name = name

    def press(self):
        self.pressed = time.time()

    def release(self):
        elapsed_time = time.time() - self.pressed
        press_type = "shortPress" if elapsed_time < LONG_PRESS_THRESHOLD else "longPress"
        send_dds(self.name, press_type)
        self.pressed = None
        

buttons = [
    Button(scancode = KEY_POWER, name = "power"),
    Button(scancode = KEY_STOP,  name = "estop"),
]

device = InputDevice("/dev/input/by-path/platform-gpio-keys-event")
device.grab()

try:
    for event in device.read_loop():
        if event.type != ecodes.EV_KEY:
            continue
        
        data = categorize(event)
        for button in buttons:
            if button.scancode == data.scancode:
                if data.keystate:
                    button.press()
                else:
                    button.release()
                    gpio_log.info(data)
except:
	dds.shutdown()
	raise
finally:
    device.ungrab()
