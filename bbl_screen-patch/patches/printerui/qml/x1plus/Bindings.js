.pragma library
.import X1PlusNative 1.0 as JSX1PlusNative
.import "Binding.js" as Binding

var X1Plus = null;


var _X1PlusNative = JSX1PlusNative.X1PlusNative;


/**
 * Bindings to provide easier access to DeviceManager and 
 * PrintManager properties. Functions executed on device 
 * status changes belong here. These bindings can be used to
 * expose these properties through DDS/Dbus/MQTT.
 * 
 * 
 * Also adds bindings for printer controls. Examples:
 * turn on toolhead LED: 
 *     Bindings.LED.toolhead(1)
 * 
 * retrieve hotend current temp: 
 *     let currentTemp = Bindings.heaters.hotend()
 */

var [printState, printStateChanged, _setPrintState] = Binding.makeBinding(-1);
var [isHomed, isHomedChanged, _setIsHomed] = Binding.makeBinding(false);
var [hasSleep, hasSleepChanged, _setHasSleep] = Binding.makeBinding(false);
var [printIdle, printIdleChanged, _setPrintIdle] = Binding.makeBinding(false);
var [ramp, rampChanged, _setRamp] = Binding.makeBinding([]);
var [layerNum, layerNumChanged, _setLayerNum] = Binding.makeBinding(-1);
var [totalLayerNum, totalLayerNumChanged, _setTotalLayerNum] = Binding.makeBinding(-1);
var [printSpeed, printSpeedChanged, _setPrintSpeed] = Binding.makeBinding(-1);

const printerStatus = {
    setHome: (pm) => { /* no QML signal exists for this one */
        _setIsHomed((pm.homedState & pm.AXIS_HOMED_ALL) >= pm.AXIS_HOMED_ALL)
    },
    setIdle: (val) => { /* bool, updated by onPrintIdleChanged in SettingsListener.qml */
        _setPrintIdle(val)
    },
    setSleep: (val) => { /* bool, updated by onSleepChanged in SettingsListener.qml */
        sleepStateChanged(val) 
    },
    setSpeed: (pm) => { /* no QML signal exists for this one */
        _setPrintSpeed(pm.currentTask.printSpeed)
    },
    setRamp: (rampData) => { /* stores array of speed ramp values */
        _setRamp(rampData)
    },
    setState: (val) => { /* integer, updated by onPrintStateChanged in PrintListener.qml */
        printStateChanged(val)
    },
    setLayer: (val) => { /* bool, updated by onLayerNumChanged in PrintListener.qml */
        currentLayerChanged(val);
    }
};

function printSpeedGcode(speed){
    let gcode = X1Plus.GcodeGenerator.speed(speed);
    console.log(gcode);
    X1Plus.sendGcode(gcode);
    return gcode;
}

/** Printer control bindings
 * USAGE: Heaters:
 * X1Plus.Bindings.heaters.hotend(250);
 * X1Plus.Bindings.heaters.all(0);
 * 
 * Fans:
 * X1Plus.Bindings.fans.cooling(250);
 * bool isOn = X1Plus.Bindings.fans.cooling();
 * 
 * LEDs
 * X1Plus.Bindings.LED.backlight(50);
*/
const heaters = {
    hotend: (val='') => {
        if (val >= 0 && val < 300){
            X1Plus.PrintManager.heaters.hotend.targetTemp = val;   
        } else {
            return X1Plus.PrintManager.heaters.hotend.currentTemp;
        }
    },
    bed: (val='') => {
        if (val >= 0 && val < 110){
            X1Plus.PrintManager.heaters.heatbed.targetTemp = val;   
        } else {
            return X1Plus.PrintManager.heaters.heatbed.currentTemp;
        }
    },
    all: (val) => {
        X1Plus.PrintManager.heaters.hotend.targetTemp = val
        X1Plus.PrintManager.heaters.heatbed.targetTemp = val
    }
}


const fans = {
    cooling: (val='') => {
        if (val >= 0 && val < 256){
            X1Plus.PrintManager.fans.cooling.fanSpeed = val/10;   
        } else {
            return X1Plus.PrintManager.fans.cooling.isOn;
        }
    },
    auxiliary: (val='') => {
        if (val >= 0 && val < 256){
            X1Plus.PrintManager.fans.auxiliary.fanSpeed = val/10;   
        } else {
            return X1Plus.PrintManager.fans.auxiliary.isOn;
        }
    },
    chamber: (val='') => {
        if (val >= 0 && val < 256){
            X1Plus.PrintManager.fans.chamber.fanSpeed = val/10;   
        } else {
            return X1Plus.PrintManager.fans.chamber.isOn;
        }
    },
    
    all: (val) => {
        val/0.1*val;
        X1Plus.PrintManager.fans.cooling.fanSpeed = val;
        X1Plus.PrintManager.fans.auxiliary.fanSpeed = val;
        X1Plus.PrintManager.fans.chamber.fanSpeed = val;  
    }
}


const LED = {
    backlight: (val=100) => {
        //on: 100, off: 0
        _X1PlusNative.updateBacklight(val);
    },
    toolhead: (val=1) => { 
        //on: 1, off: 0
        X1Plus.sendGcode(X1Plus.GcodeGenerator.M960.toolhead(val));
    },
    // chamber: (val=1) => {
    //     //on: 1, off: 0
    //     if (val == 1) val = 255;
    //     _X1PlusNative.updateChamberLED(val);
    // }
}


/**
 * Functions executed with layer number change signal
 */
function currentLayerChanged(val){
    let _layerNum = val;
    if (X1Plus.emulating) _layerNum = 100;
    _setLayerNum(_layerNum);
    console.log("[x1p] layer number changed: ",_layerNum);
    speedRamp();
}

/**
 * Functions executed with print state change signal
 */
function printStateChanged(val){
    let _printState = val;
    _setPrintState(_printState);
    let task = X1Plus.PrintTask;
    switch (_printState) {
        case task.WORKING:
            console.log("[x1p] printtask: working");
            break;
        case task.PAUSED:
            console.log("[x1p] printtask: working");
            break;
        case task.FINISH:
            console.log("[x1p] printtask: finished");
            break;
        case task.FAILED:
            console.log("[x1p] printtask: failed");
            break;
        default:
            console.log("[x1p] print state changed: ", _printState);
            
    }
}

/**
 * Functions executed when onSleepChanged signal in SettingsListener.qml
 */
function sleepStateChanged(val){
    _setHasSleep(val);
    let thLED = X1Plus.DeviceManager.getSetting("cfw_toolhead_led", false);
    let backlight = X1Plus.DeviceManager.getSetting("cfw_brightness", 100);
    LED.toolhead(thLED);
    LED.backlight(backlight);
    // LED.chamber(chamberLED);
}


/**
 * speedRamp() - incrementally adjust speed in response to layer change
 * This function only runs if there is a print active and the speed ramp
 * feature has been activated.
 * This does the following: 
 * 1) Get current speed, target speed, current layer, target layer, and step
 * size for ramping
 * 2) "Calculate" the speed level for the current layer and if the current
 * speed minus the calculated speed exceeds the stepsize, then update speed
 */
function speedRamp(){
    let speed = (X1Plus.emulating) ? 100 :  X1Plus.Bindings.printSpeed();
    let ramp = X1Plus.Bindings.ramp();
    if (ramp == []) return;
    let rampCur = ramp[0];
    let rampTar = ramp[1];
    let rampCurSpeed = ramp[2];
    let rampTarSpeed = ramp[3];
    let delta = ramp[4]; 
    if (rampCur > 1 && rampTar > 1) {
        console.log("[x1p] Ramping speed - ", rampCur, rampTar);
        if (layerNum >= rampTar){
            console.log("[x1p] Finished ramping speed : ",layerNum,totalLayer);
            printerStatus.setRamp([]);
        } else {
            let rampLevel = X1Plus.GcodeGenerator.getRampSpeed([layerNum,rampCur,rampTar,rampCurSpeed,rampTarSpeed,delta]);
            if (Math.abs(speed - rampLevel) < Math.abs(delta)) {
                printerStatus.setPrintSpeedGcode(rampLevel);
            }
        }
        
    }       
}