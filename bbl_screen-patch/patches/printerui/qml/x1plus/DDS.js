.pragma library
.import DdsListener 1.0 as JSDdsListener
.import X1PlusNative 1.0 as JSX1PlusNative
.import "Binding.js" as Binding

var X1Plus = null;

var _DdsListener = JSDdsListener.DdsListener;
var _X1PlusNative = JSX1PlusNative.X1PlusNative;

/**
 * DDS topics and message creation
 * Call this object from anywhere in QML to publish a DDS message
 * Usage:
 * X1Plus.DDS.publisher.publish_gcode("M106 P2 S255",0)
 */
const publisher = {
    
    get_setting: 
        (_key,seq_id) => publish("device/x1plus",{settings: "getSetting", key:_key, sequence_id: seq_id }),
    put_setting: 
        (_key,_val,seq_id) => publish("device/x1plus",{settings: "putSetting",key:_key, value:_val, sequence_id: seq_id }),
    version_request: 
        (seq_id) => publish("device/request/info",{command: "get_version", sequence_id: seq_id }),
    publish_gcode: 
        (gcode_line,seq_id) => publish("device/request/print",{command: "gcode_line",param: gcode_line,sequence_id: seq_id}),
    print_gcode_file: 
        (gcode_file,seq_id) => publish("device/request/print",{command: "gcode_file",param: gcode_file,sequence_id: seq_id}),
    push_status: 
        (action, seq_id) => publish("device/request/print",{command: "push_status", "gcode_claim_action":action,  sequence_id: seq_id }),
    upgrade_consistency: 
        (seq_id) => publish("device/request/upgrade",{command: "consistency_confirm", sequence_id: seq_id }),
    upgrade_start: 
        (_module, _version,_fName,seq_id) => publish("device/request/upgrade",{command: "start", sequence_id: seq_id,module: _module.split("/")[0], version: _version,url: `http://127.0.0.1:8888/${_fName}`}),
}
const topics = {
    gpiokeys: "device/x1plus",
    push_status: "device/report/print",
    get_version: "device/report/info",
    mc_print: "device/report/mc_print",
}

function publish(topic, json) {
    _DdsListener.publishJson(topic, JSON.stringify(json));
}

var _handlers = [];
function registerHandler(topic, callback) {
    _handlers.push({ topic: topic, fn: callback });
}

_DdsListener.gotDdsEvent.connect(function(topic, message) {
    var data = null;
    for (const i in _handlers) {
        const handler = _handlers[i];
        if (handler.topic == topic) {
            if (data == null) {
                data = JSON.parse(message);
            }
            handler.fn(data);
        }
    }
});


var [versions, versionsChanged, _setVersions] = Binding.makeBinding([]);

function requestVersions() {
    publisher.version_request(0);
    if (X1Plus.emulating) {
        _setVersions([
            {"hw_ver":"","name":"ota","sn":"","sw_ver":"01.05.01.00"},
            {"hw_ver":"AP05","name":"rv1126","sn":"00M00A9A9999999","sw_ver":"00.00.19.15"},
            {"hw_ver":"TH09","name":"th","sn":"00301B9A9999999","sw_ver":"00.00.04.98"},
            {"hw_ver":"MC07","name":"mc","sn":"00201A9A9999999","sw_ver":"00.00.14.44/00.00.14.44"},
            {"hw_ver":"","name":"xm","sn":"","sw_ver":"00.01.02.00"},
            {"hw_ver":"AHB00","name":"ahb","sn":"00K00A999999999","sw_ver":"00.00.00.42"},
            {"hw_ver":"AMS08","name":"ams/0","sn":"00600A999999998","sw_ver":"00.00.06.15"},
            {"hw_ver":"AMS08","name":"ams/1","sn":"00600A999999999","sw_ver":"00.00.06.15"}
        ]);
    }
}

/** 
 * Topic: device/report/info
 * SettingsListener.qml, UpgradeDialog.qml, VersionPage.qml
 * {command: "get_version", "sequence_id": 0}
 * */
registerHandler(topics.get_version(), function(datum) {
    if (datum.command == "get_version") {
        _setVersions(datum.module);
    }
});


var [gcodeAction, gcodeActionChanged, _setGcodeAction] = Binding.makeBinding(-1);

/** 
 * Topic: device/report/print
 * Not in use
 * {command: "push_status", "gcode_claim_action", 0: "sequence_id": 0}
 * */
registerHandler(topics.push_status(), function(datum) {
    if (datum.command == "push_status" && datum.print_gcode_action) {
        if (gcodeAction() != datum.print_gcode_action) {
            _setGcodeAction(datum.print_gcode_action);
        }
    }
});

/** 
 * Topic: device/report/mc_print
 * BedMeshCalibration.js and ShaperCalibration.js
 * {command: "mesh_data", "param": {x: 0, y: 0, z: 0}, "sequence_id": 0}
 * */
registerHandler(topics.mc_print(), function(datum) {
    if (datum.command == "mesh_data") {
        X1Plus.BedMeshCalibration.parse_data(datum);
    } else if (["vc_data", "vc_enable", "vc_params"].includes(datum.command)) {
        X1Plus.ShaperCalibration.parse_data(datum);
    }     
});


/** 
 * Topic: device/x1plus
 * Gpiokeys.py
 * {gpio: {button: "power", event: "shortPress"}}
 * */
registerHandler(topics.gpiokeys(), function(datum) {
    if (datum.gpio){
        X1Plus.Gpiokeys._handleButton(datum);
    } else if (datum.settings && datum.key) { /* Settings - format not finalized! */
        if (datum.settings == "getSetting") {  
            //publish setting value to DDS (or just MQTT)
        } else if (datum.settings == "putSetting") { 
            X1Plus.Settings.putSetting(datum.key,datum.value);
        }
    }
});

