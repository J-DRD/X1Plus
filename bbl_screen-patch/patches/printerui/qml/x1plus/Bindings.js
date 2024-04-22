.pragma library
.import DdsListener 1.0 as JSDdsListener
.import X1PlusNative 1.0 as JSX1PlusNative
.import "Binding.js" as Binding

var X1Plus = null;

var _DdsListener = JSDdsListener.DdsListener;
var _X1PlusNative = JSX1PlusNative.X1PlusNative;


/**
 * These properties are used to create bindings that expose some of the properties that the
 * printer uses in QML including print status, layer number, printer speed, etc. These are not
 * all configured the same, and some use QML signals to refresh property bindings while others
 * call an instance of the target QML type to retrieve info. The preferred setup is the former.
 * 
 * ex 1: layerNum() is updated by calling Bindings.printLayer.setCurrent() in the 
 * onLayerNumChanged signal in PrintListener.qml
 * 
 * ex 2: printSpeed() is updated by calling Bindings.printerStatus.currentSpeed(PrintManager) from
 * QML. There is not a preexisting signal for this property,  
 */
var [layerNum, layerNumChanged, _setLayerNum] = Binding.makeBinding(-1);
var [totalLayerNum, totalLayerNumChanged, _setTotalLayerNum] = Binding.makeBinding(-1);

var printLayer = {
    setCurrent: (val) => {
        currentLayerChanged(val);
    },
    setTotal: (val) => {
        _setTotalLayerNum(val);
    }
};


var [printSpeed, printSpeedChanged, _setPrintSpeed] = Binding.makeBinding(-1);
var [sleep, sleepChanged, _setSleep] = Binding.makeBinding(false);
var [aboutToSleep, aboutToSleepChanged, _setAboutToSleep] = Binding.makeBinding(false);
var [isHomed, isHomedChanged, _setIsHomed] = Binding.makeBinding(false);
var [printIdle, printIdleChanged, _setPrintIdle] = Binding.makeBinding(false);
var [runout, runoutChanged, _setRunout] = Binding.makeBinding(false);
var [ramp, rampChanged, _setRamp] = Binding.makeBinding([]);
var [printing, printingChanged, _setPrinting] = Binding.makeBinding(false);
var [printState, printStateChanged, _setPrintState] = Binding.makeBinding(-1);

var printerStatus = {
    sleepState: (val) => {
        sleepStateChanged(val);
    },
    aboutToSleepState: (val) => {  _setAboutToSleep(val)},
    homeState: (pm) => {_setIsHomed((pm.homedState & pm.AXIS_HOMED_ALL) >= pm.AXIS_HOMED_ALL)},
    printIdleState: (val) => {_setPrintIdle(val)},
    filamentRunoutState: (pm) => {_setRunout(pm.MS_FILAMENT_LOADED)},
    setPrintSpeedGcode: (val) => {
        let gcode = X1Plus.GcodeGenerator.speed(val);
        console.log(gcode);
        X1Plus.sendGcode(gcode);
        return gcode;
    },
    currentSpeed: (pm) => { _setPrintSpeed(pm.currentTask.printSpeed)},
    updatePrintSpeed: () => {
        _setPrintSpeed(X1Plus.PrintManager.currentTask.printSpeed);
    },
    updateRamp: (startLayer,endLayer,currentSpeed,targetSpeed,delta) => { _setRamp([startLayer,endLayer,currentSpeed,targetSpeed, delta])},
    updatePrinting: (val) => {
        printingChanged(val);
    },
    updatePrintState: (val) => {
        printStateChanged(val);
    },
}


/** PRINTER CONTROL BINDINGS */

/** Heater control
 * Control the hotend or bed heater or retrieve its current temperature.
 * Usage:
 * get:   let currentTemp = X1Plus.Bindings.heaters.hotend()
 * set:   X1Plus.Bindings.heaters.hotend(300)
 */
var heaters = {
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

/** Fan control
 * Control the fans or retrieve their on/off status
 * Usage:
 * get:   let fanOn = X1Plus.Bindings.fans.cooling()
 * set:   X1Plus.Bindings.fans.cooling(255)
 */
var fans = {
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


/** LED control
 * Control the LEDs or backlight
 * Usage:
 * set:   X1Plus.Bindings.LED.toolhead(1)
 * 
 * TODO: add get functions
 */
var LED = {
    backlight: (val=100) => {
        //on: 100, off: 0
        _X1PlusNative.updateBacklight(val);
    },
    toolhead: (val=1) => { 
        //on: 1, off: 0
        X1Plus.sendGcode(X1Plus.GcodeGenerator.M960.toolhead(val));
    },
    chamber: (val=1) => {
        //on: 1, off: 0
        if (val == 1) val = 255;
        _X1PlusNative.updateChamberLED(val);
    }
}


/** PRINTER STATUS BINDINGS */

/**
 * currentLayerChanged - this function is called on each layer change 
 * in response to 'layerNum' changes in PrintListener.qml
 * 
 * Actions: update layer counts, ramping for speed adjustment
 * Signal:
 * PrintManager.currentTask.layerNum
 */

function currentLayerChanged(val){
    let _layerNum = val;
    if (X1Plus.emulating) _layerNum = 100;
    _setLayerNum(_layerNum);
    console.log("[x1p] layer number changed: ",_layerNum);
    speedRamp();

}


/**
 * printingChanged - this function is called when PrintTask.WORKING is true
 * This is just a boolean so there are only two possible states. This responds
 * to 'onPrintingChanged' signal in PrintListener.qml
 * Signal:
 * PrintManager.currentTask.stage >= PrintTask.WORKING
 */

function printingChanged(val){
    let _printing = val;
    _setPrinting(_printing);
    console.log("[x1p] print status changed: ",_printing);

}


/**
 * printStateChanged - this function is called when PrintManager.currentTask.state
 * changes. This responds to to 'onPrintStateChanged' signal in PrintListener.qml
 * Signal:
 * PrintManager.currentTask.state 
 */

function printStateChanged(val){
    let _printState = val;
    _setPrintState(_printState);
    let task = _X1PlusNative.PrintTask;
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
 * sleepStateChanged - this function is called when DeviceManager.power.hasSleep
 * changes (either true or false)
 * This responds to 'onSleepChanged' sigal in SettingsListener.qml
 * Signal:
 * DeviceManager.power.hasSleep
 */

function sleepStateChanged(val){
    let _sleepState = val;
    _setSleep(_sleepState);
    console.log("[x1p] sleep state changed: ",_sleepState);
}



/** Functions executed on signal changes  */

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
            console.log("finished",layerNum,totalLayer);
            X1Plus.Bindings.printerStatus.updateRamp([]);
        } else {
            let rampLevel = gcodeLibrary.macros.getRampSpeed(layerNum,rampCur,rampTar,rampCurSpeed,rampTarSpeed,delta);
            if (Math.abs(speed - rampLevel) < Math.abs(delta)) {
                X1Plus.Bindings.printerStatus.setPrintSpeedGcode(rampLevel);
                console.log("[x1p] speed level ramped",layerNum,rampCur,rampTar,rampCurSpeed,rampTarSpeed,delta);
            }
        }
        
    }       
}