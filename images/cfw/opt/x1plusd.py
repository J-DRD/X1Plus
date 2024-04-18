#!/opt/python/bin/python3
import os, dds
import copy
import shutil
from functools import lru_cache
from pathlib import Path
import json
import subprocess
import traceback
import time
import datetime
import requests
from logger.custom_logger import CustomLogger

# should probably check if the user has SD logging enabled? if so, change the filepath to /sdcard/log/x1plusd.log
x1pusd_log = CustomLogger("x1plusd", "/tmp/x1plusd.log", 500000, 1, False)

# probably this should be encapsulated in a DDS class, but...
dds_request_queue = None
dds_report_publisher = None


def dds_report(data):
    if dds_report_publisher:
        dds_report_publisher(json.dumps(data))


dds_handlers = {}


def dds_start():
    global dds_request_queue, dds_report_publisher

    dds_request_queue = dds.subscribe("device/request/x1plus")
    dds_report_publisher = dds.publisher("device/report/x1plus")
    x1pusd_log.info("x1plusd: Starting DDS")
    print("x1plusd: waiting for DDS startup")
    time.sleep(3)  # evade, don't solve, race conditions


def dds_loop():
    x1pusd_log.info("x1plusd: Starting DDS Loop")
    while True:
        req_raw = dds_request_queue.get()  # blocks until a message arrives
        try:
            req = json.loads(req_raw)
            for k in dds_handlers:
                if k in req:
                    dds_handlers[k](req)
        except Exception as e:
            # TODO: log this
            x1pusd_log.error(f"x1plusd: exception while handling request {req_raw}")
            print(f"x1plusd: exception while handling request {req_raw}")
            traceback.print_exc()


class OTAService:
    """
    Our OTA engine service, used to check/download X1Plus OTAs.

    Input DDS: device/request/x1plus
    Output DDS: device/report/x1plus

    Payload Key: ota

    Examples:
    Request: {"ota": {"check": true } # check for an OTA update, new OTA available
    Response: {"ota_available": true, "error_on_last_check": false, "last_checked": TIMESTAMP, "ota_info": {...}, "is_downloaded": false}

    Request: {"ota": {"check": true } # check for an OTA update, no new OTA
    Response: {"ota_available": false, "error_on_last_check": false, "last_checked": TIMESTAMP, "ota_info": null, "is_downloaded": false}

    Request: {"ota": {"check": true } # check for an OTA update, error
    Response: {"ota_available": false, "error_on_last_check": true, "last_checked": TIMESTAMP, "ota_info": null, "is_downloaded": false}

    Request: {"ota": {"check": true } # check for an OTA update, but OTAs are disabled (how did you get here?)
    Response: {"ota_available": false, "error_on_last_check": false, "last_checked": null, "ota_info": null, "is_downloaded": false}

    Request: {"ota": {"check": false } # Don't check for an OTA, but get current status
    Response: (varies, same structure as above)
    """
    def __init__(self):
        self.ota_url = "https://ota.x1plus.net/stable/ota.json"
        self.ota_available = False
        self.last_check_timestamp = None
        self.last_check_response = None
        self.last_check_error = False
        self.ota_downloaded = False

        try:
            with open("/opt/info.json", "r") as fh:
                self.build_info = json.load(fh)
        except FileNotFoundError:
            x1pusd_log.error("x1plusd: /opt/info.json was not found! Setting mock values so we get an OTA to recover!")
            self.build_info = {
                "cfwVersion": "0.1",
                "date": "2024-04-17",
                "buildTimestamp": 1713397465.0
            }

        # register self with DDS...
        dds_handlers["ota"] = self._handle
        
        # Lastly, trigger a check during __init__
        self._update_check({"check": True})

    def _handle(self, req):
        # Parse what we were asked to do
        if "check" in req["ota"]:
            self._update_check(req["ota"])

    def _update_check(self, payload):
        ota_response = {
            "ota_available": self.ota_available,
            "err_on_last_check": self.last_check_error,
            "last_checked": self.last_check_timestamp,
            "ota_info": self.last_check_response,
            "is_downloaded": self.ota_downloaded,
        }

        # First, if we were asked just for the last status, just return our ota object
        if not payload.get("check", False):
            dds_report({"ota": ota_response})
            return

        # Load in our settings.json, we need to make sure we are still enabled! :)
        try:
            with open(f"/mnt/sdcard/x1plus/printers/{_get_sn()}/settings.json", "r") as fh:
                x1p_settings = json.load(fh)
        except FileNotFoundError:
            x1pusd_log.error("x1plusd: OTA can't find settings.json, assuming OTAs are disabled!")
            x1p_settings = {"ota": {"enable": False}}

        # Do we have OTAs enabled? If not, just return current status
        if not x1p_settings.get("ota", {"enable": False}).get("enable"):
            print("x1plusd: OTA check is disabled, skipping check!")
            x1pusd_log.info("x1plusd: OTA check is disabled, skipping check!")
            dds_report({"ota": ota_response})
            return
        
        # If we are here we want to check, so check
        try:
            # Update check timestamp first
            self.last_check_timestamp = datetime.datetime.now().timestamp()
            r = requests.get(self.ota_url, timeout=5)
            self.last_check_response = r.json()
        except Exception as e:
            print(f"x1plusd: Exception calling OTA URL! Error of: {e}")
            x1pusd_log.info(f"x1plusd: Exception calling OTA URL! Error of: {e}")            
            # we Timed out, or hit other error with requests
            self.last_check_error = True
            return

        # Now that we have the build info, do our check to see if there's an update
        if self.build_info.get("buildTimestamp",0) < self.last_check_response.get("buildTimestamp",0):
            self.ota_available = True

        # Return result of our check
        dds_report({"ota": ota_response})

class SettingsService:
    """
    Our settings daemon service, used to set X1Plus settings.

    Input DDS: device/request/x1plus
    Output DDS: device/report/x1plus

    Payload Key: settings

    Examples:
    Request: {"settings": {"set": {"KEY": "VALUE"}} # sets a setting
    Response: {"settings": {"changes": {"KEY": "VALUE"}}}

    Request: {"settings": {"set": {"KEY": {"NESTED_KEY":"VALUE"}}}} # sets a nested setting
    Response: {"settings": {"changes": {"KEY": {"NESTED_KEY":"VALUE"}}}}

    Request: {"settings": {"set": "str" } # Incorrect set usage, requires a dict
    Response: {"settings": {"rejected_changes": "str"}}
    """

    DEFAULT_X1PLUS_SETTINGS = {
        "boot": {
            "quick_boot": False,
            "dump_emmc": False,
            "sdcard_syslog": False,
            "perf_log": False,
        },
        "ota": {
            "enable": False,
        },
        "ssh": {
            "enable": False,
            "password": "",
        },
        "screen": {
            "home_image": "",
            "print_image": "",
            "brightness": 100.0,
        },
        "lockscreen": {
            "passcode": "",
            "locktype": 0,
            "lockscreen_image": "",
        },
        "leds": {
            "toolhead": True,
            "chamber": True,
        },
        "default_console": False,
        "shield_mode": False,
        "vibration_comp": None,
    }

    def __init__(self):
        self.settings_dir = f"/mnt/sdcard/x1plus/printers/{_get_sn()}"
        self.filename = f"{self.settings_dir}/settings.json"
        os.makedirs(self.settings_dir, exist_ok=True)

        # Before we startup, do we have our settings file? Try to read, create if it doesn't exist.
        try:
            with open(self.filename, "r") as fh:
                self.settings = json.load(fh)
        except FileNotFoundError as exc:
            x1pusd_log.debug("x1plusd: settings file not found. Creating one with defaults")
            print("Settings file does not exist, creating with defaults...")
            self.settings = self._migrate_old_settings()
            self._save()
            dds_report({"settings": {"changes": self.settings}})

        # register it...
        dds_handlers["settings"] = self._handle

    def _migrate_old_settings(self):
        """
        Used to migrate init.d flag files, AND custom x1plus settings, to our new json on first run
        """
        defaults = copy.deepcopy(SettingsService.DEFAULT_X1PLUS_SETTINGS)

        # Boot settings:
        BOOT_SETTINGS = defaults["boot"]
        # quick boot
        if os.path.exists(f"{self.settings_dir}/quick-boot"):
            BOOT_SETTINGS.update({"quick_boot": True})
            Path(f"{self.settings_dir}/quick-boot").unlink(missing_ok=True)
        # dump emmc
        if os.path.exists(f"{self.settings_dir}/dump-emmc"):
            BOOT_SETTINGS.update({"dump_emmc": True})
            Path(f"{self.settings_dir}/dump-emmc").unlink(missing_ok=True)
        # syslog to sd
        if os.path.exists(f"{self.settings_dir}/logsd"):
            BOOT_SETTINGS.update({"sdcard_syslog": True})
            Path(f"{self.settings_dir}/logsd").unlink(missing_ok=True)
        # performance logging (debugging)
        if os.path.exists(f"{self.settings_dir}/perf_log"):
            BOOT_SETTINGS.update({"perf_log": True})
            Path(f"{self.settings_dir}/perf_log").unlink(missing_ok=True)
        defaults.update({"boot": BOOT_SETTINGS})

        # Load in the printer.json so we can migrate settings
        PRINTER_JSON = {}
        if os.path.exists("/config/screen/printer.json"):
            with open("/config/screen/printer.json", "r") as fh:
                PRINTER_JSON = json.load(fh)

        # Only do "migration" if the file exists and we loaded it.
        # note: python returns false for an empty dict
        if PRINTER_JSON:
            # ssh
            SSH_SETTINGS = defaults["ssh"]
            SSH_SETTINGS.update({"enable": PRINTER_JSON.get("cfw_sshd", defaults['ssh']['enable'])})
            SSH_SETTINGS.update({"password": PRINTER_JSON.get("cfw_rootpw", defaults['ssh']['password'])})
            defaults.update({"ssh": SSH_SETTINGS})
            # screen
            SCREEN_SETTINGS = defaults["screen"]
            SCREEN_SETTINGS.update({"home_image": PRINTER_JSON.get("cfw_home_image", defaults['screen']['home_image'] )})
            SCREEN_SETTINGS.update({"print_image": PRINTER_JSON.get("cfw_print_image", defaults['screen']['print_image'])})
            SCREEN_SETTINGS.update({"brightness": PRINTER_JSON.get("cfw_brightness", defaults['screen']['brightness'])})
            defaults.update({"screen": SCREEN_SETTINGS})
            # lockscreen
            LOCKSCREEN_SETTINGS = defaults["lockscreen"]
            LOCKSCREEN_SETTINGS.update({"passcode": PRINTER_JSON.get("cfw_passcode", defaults['lockscreen']['passcode'] )})
            LOCKSCREEN_SETTINGS.update({"locktype": PRINTER_JSON.get("cfw_locktype", defaults['lockscreen']['locktype'])})
            LOCKSCREEN_SETTINGS.update({"lockscreen_image": PRINTER_JSON.get("cfw_lockscreen_image", defaults['lockscreen']['lockscreen_image'])})
            defaults.update({"lockscreen": LOCKSCREEN_SETTINGS})
            # leds
            LED_SETTINGS = defaults["leds"]
            LED_SETTINGS.update({"toolhead": PRINTER_JSON.get("cfw_toolhead_led", defaults['leds']['toolhead'] )})
            # chamber doesn't exist yet, no migration for that setting :)
            defaults.update({"leds": LED_SETTINGS})
            # And finally, the last few settings that don't live nested
            defaults.update({"default_console": PRINTER_JSON.get("cfw_default_console", defaults['default_console'])}) 
            defaults.update({"shield_mode": PRINTER_JSON.get("cfw_shield", defaults['shield_mode'])}) 
            defaults.update({"vibration_comp": PRINTER_JSON.get("cfw_vc", defaults['vibration_comp'])})

            # EVERYTHING BELOW IS TESTED BUT DISABLED UNTIL BBL_SCREEN IS MOVED OVER TO SETTINGS.JSON!!!

            # # Now that we did migrations, also remove flags FROM PRINTER_JSON
            # for setting in ['cfw_passcode', 'cfw_locktype', 'cfw_brightness', 'cfw_toolhead_led', 'cfw_shield', 'cfw_sshd', 'cfw_rootpw', 'cfw_default_console', 'cfw_vc', 'cfw_home_image', 'cfw_print_image', 'cfw_lockscreen_image']:
            #     if setting in PRINTER_JSON:
            #         PRINTER_JSON.pop(setting,None)

            # # Back up printer.json before we saved our cleaned, de-cfw'd version
            # shutil.copyfile("/config/screen/printer.json", "/config/screen/printer.json.pre_x1plusd")

            # # And finally, write our cleaned settings now that we backed the file up first
            # with open("/config/screen/printer.json", "w") as f:
            #     json.dump(PRINTER_JSON, f, indent=4)

        return defaults

    def _save(self):
        # XXX: atomically rename this

        with open(self.filename, "w") as f:
            json.dump(self.settings, f, indent=4)

    def _handle(self, req):
        # Parse what we were asked to do
        if "set" in req["settings"]:
            settings_set = req["settings"]["set"]

            if not isinstance(settings_set, dict):
                x1pusd_log.debug(f"x1p_settings: set request {req} is not a dictionary")
                print(f"x1p_settings: set request {req} is not a dictionary")
                return

            self.settings.update(settings_set)
            self._save()

            x1pusd_log.info(f"x1p_settings: updated {settings_set}")
            print(f"x1p_settings: updated {settings_set}")

            # Inform everyone else on the system, only *after* we have saved
            # and made it visible.  That way, anybody who wants to know
            # about this setting either will have read it from disk
            # initially, or will have heard about the update from us after
            # they read it.
            dds_report({"settings": {"changes": settings_set}})
        else:
            x1pusd_log.debug(f"x1p_settings: settings request {req} was not a known opcode")
            print(f"x1p_settings: settings request {req} was not a known opcode")


# TODO: hoist this into an x1plus package
@lru_cache(None)
def _get_sn():
    """
    Used to get the Serial Number for the Printer
    """
    try:
        return subprocess.check_output(["bbl_3dpsn"], stderr=subprocess.DEVNULL).decode("utf-8")
    except:
        x1pusd_log.error("_get_sn() failed to run bbl_3dpsn, and we are now dazed and confused. Exiting...")
        print("_get_sn() failed to run bbl_3dpsn, and we are now dazed and confused. Exiting...")
        raise


if __name__ == "__main__":
    # TODO: check if we are already running
    try:
        # Setup/register with DDS
        dds_start()

        # Call our services so they register with dds
        settings = SettingsService()
        ota = OTAService()

        # Start our DDS listener
        dds_loop()
    except:
        dds.shutdown()
        raise
