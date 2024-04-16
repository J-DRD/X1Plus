#!/opt/python/bin/python3
import dds
import json
import time

# probably this should be encapsulated in a DDS class, but...

pub = dds.publisher("device/request/x1plus")
resp = dds.subscribe("device/report/x1plus")

time.sleep(3) # this really should instead use pub_matched_cb to know when we're ready to roll, but that's not exposed from dds.py yet

pub(json.dumps({"settings": { "set": {"hax": "very"} }}))

try:
    while True:
        print(resp.get())
except:
    dds.shutdown()
