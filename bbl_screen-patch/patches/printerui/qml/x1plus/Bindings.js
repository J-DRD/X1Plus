.pragma library
.import DdsListener 1.0 as JSDdsListener
.import X1PlusNative 1.0 as JSX1PlusNative
.import "Binding.js" as Binding

var X1Plus = null;

var _DdsListener = JSDdsListener.DdsListener;
var _X1PlusNative = JSX1PlusNative.X1PlusNative;


var [layerNum, layerNumChanged, _setLayerNum] = Binding.makeBinding(-1);
var [totalLayerNum, totalLayerNumChanged, _setTotalLayerNum] = Binding.makeBinding(-1);

var printLayer = {
    setCurrent: () => {
        _setLayerNum(X1Plus.PrintManager.currentTask.layerNum);
    },
    setTotal: () => {
        _setTotalLayerNum(X1Plus.PrintManager.currentTask.totalLayerNum);
    }
};


var [printSpeed, printSpeedChanged, _setPrintSpeed] = Binding.makeBinding(-1);
var [sleep, sleepChanged, _setSleep] = Binding.makeBinding(false);
var [aboutToSleep, aboutToSleepChanged, _setAboutToSleep] = Binding.makeBinding(false);
var [isHomed, isHomedChanged, _setIsHomed] = Binding.makeBinding(false);
var [printIdle, printIdleChanged, _setPrintIdle] = Binding.makeBinding(false);
var [runout, runoutChanged, _setRunout] = Binding.makeBinding(false);

var printerStatus = {
    sleepState: (val) => {  _setSleep(val)},
    aboutToSleepState: (val) => {  _setAboutToSleep(val)},
    homeState: (pm) => {_setIsHomed((pm.homedState & pm.AXIS_HOMED_ALL) >= pm.AXIS_HOMED_ALL)},
    printIdleState: (val) => {_setPrintIdle(val)},
    filamentRunoutState: (pm) => {_setRunout(pm.MS_FILAMENT_LOADED)},
    setPrintSpeedGcode: (val) => {
        let gcode = X1Plus.GcodeGenerator.M2042(val);
        console.log(gcode);
        X1Plus.sendGcode(gcode);
        return gcode;
    },
    currentSpeed: (pm) => { _setPrintSpeed(pm.currentTask.printSpeed)},
    updatePrintSpeed: () => {
        _setPrintSpeed(X1Plus.PrintManager.currentTask.printSpeed);
    },
}    


var heaters = {
    hotend: (val) => {
        X1Plus.PrintManager.heaters.hotend.targetTemp = val
    },
    bed: (val) => {
        X1Plus.PrintManager.heaters.heatbed.targetTemp = val
    },
    all: (val) => {
        X1Plus.PrintManager.heaters.hotend.targetTemp = val
        X1Plus.PrintManager.heaters.heatbed.targetTemp = val
    }
}

var fans = {
    cooling: {
        setSpeed: (val) => {X1Plus.PrintManager.fans.cooling.fanSpeed = val/10},
        isOn: () => {return X1Plus.PrintManager.fans.cooling.isOn},
    },
    auxiliary: {
        setSpeed: (val) => {X1Plus.PrintManager.fans.auxiliary.fanSpeed = val/10},
        isOn: () => {return X1Plus.PrintManager.fans.auxiliary.isOn},
    },
    chamber: {
        setSpeed: (val) => {X1Plus.PrintManager.fans.chamber.fanSpeed = val/10},
        isOn: () => {return X1Plus.PrintManager.fans.chamber.isOn},
    },
    all: {
        setSpeed: (val) => {
            val/0.1*val;
            X1Plus.PrintManager.fans.cooling.fanSpeed = val;
            X1Plus.PrintManager.fans.auxiliary.fanSpeed = val;
            X1Plus.PrintManager.fans.chamber.fanSpeed = val;
        },
        
    }
}

var LED = {
    backlight: (val=100) => {
        _X1PlusNative.updateBacklight(val);
    },
    toolhead: (val=0) => {
        X1Plus.sendGcode(X1Plus.GcodeGenerator.M960.toolhead(val));
    },
    chamber: (val=100) => {
        _X1PlusNative.updateChamberLED(val);
    }
}
