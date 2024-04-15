.pragma library
.import DdsListener 1.0 as JSDdsListener
.import X1PlusNative 1.0 as JSX1PlusNative
.import "Binding.js" as Binding

var X1Plus = null;

var _DdsListener = JSDdsListener.DdsListener;
var _X1PlusNative = JSX1PlusNative.X1PlusNative;

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
    publish(ddsMsg.version_request.topic, ddsMsg.version_request.msg(0));
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
registerHandler(ddsMsg.version_request.topic, function(datum) {
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
registerHandler(ddsMsg.push_status.topic(), function(datum) {
    if (datum.command == "push_status" && datum.print_gcode_action) {
        if (gcodeAction() != datum.print_gcode_action) {
            _setGcodeAction(datum.print_gcode_action);
        }
    }
});


/** 
 * Topic: device/x1plus
 * Gpiokeys.py
 * {gpio: {button: "power", event: "shortPress"}}
 * */
registerHandler(ddsMsg.x1p.topic(), function(datum) {
    if (datum.gpio){
        X1Plus.Gpiokeys._handleButton(datum);
    } else if (datum.settings && datum.param) { //Settings
        var settings = datum.param;
        if (datum.settings == "getSetting") {  //See note in Settings.js about this DDS getSetting command
            //X1Plus.Settings.getSetting()
        } else if (datum.settings == "putSetting") { 
            //X1Plus.Settings.putSetting()
        }
    }
});

var ddsMsg = {
    version_report:{
        topic: () => "device/report/info",
    },
    version_request:{
        topic: () => "device/report/info",
        msg: (cId) => {
            return {command: "get_version", sequence_id: cId };
        }
    },
    push_status:{
        topic: () => "device/report/print",
    },
    publish_gcode: {
        topic: () => "device/request/print",
        msg: (gcode,cId) => {
            var payload = {
                command: "gcode_line",
                param: gcode,
                sequence_id: cId
            };
            return payload;
        }
    },
    x1p:{
        topic: () => "device/x1plus",
    },
    upgrade_consistency: {
        topic:() => "device/request/upgrade",
        msg: (cId) => {
            let payload = {
                command: "consistency_confirm",
                sequence_id: cId
            }
            return payload;
        }
    },
    upgrade_start: {
        topic:() => "device/request/upgrade",
        msg: (cId, _module, _version,_fName) => {
            let payload = {
                    command: "start",
                    sequence_id: cId,
                    module: _module.split("/")[0],
                    version: _version,
                    url: `http://127.0.0.1:8888/${_fName}`
            }
            return payload;
        }
    },
    mc_print: {
        topic: () => "device/report/mc_print"
    }
}