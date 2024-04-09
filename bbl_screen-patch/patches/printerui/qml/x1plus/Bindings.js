.pragma library
.import DdsListener 1.0 as JSDdsListener
.import X1PlusNative 1.0 as JSX1PlusNative
.import "Binding.js" as Binding

var X1Plus = null;

var _DdsListener = JSDdsListener.DdsListener;
var _X1PlusNative = JSX1PlusNative.X1PlusNative;

var [printConfig, printConfigChanged, _setPrintConfig] = Binding.makeBinding({});

var printConfigActions = {
    setPrintSensitiveMode: (value) => {
        let config = printConfig();
        config.printSensitiveMode = value;
        _setPrintConfig(config);
    },
    getPrintSensitiveMode: () => printConfig().printSensitiveMode,

    setIsBuildPlateMarkerOn: (value) => {
        let config = printConfig();
        config.isBuildPlateMarkerOn = value;
        _setPrintConfig(config);
    },
    getIsBuildPlateMarkerOn: () => printConfig().isBuildPlateMarkerOn,

    setIsPrintingMonitorOn: (value) => {
        let config = printConfig();
        config.isPrintingMonitorOn = value;
        _setPrintConfig(config);
    },
    getIsPrintingMonitorOn: () => printConfig().isPrintingMonitorOn,

    setIsFirstLayerOn: (value) => {
        let config = printConfig();
        config.isFirstLayerOn = value;
        _setPrintConfig(config);
    },
    getIsFirstLayerOn: () => printConfig().isFirstLayerOn,

    setIsStepLossRecoveryOn: (value) => {
        let config = printConfig();
        config.isStepLossRecoveryOn = value;
        _setPrintConfig(config);
    },
    getIsStepLossRecoveryOn: () => printConfig().isStepLossRecoveryOn,

    setDoorOpenState: (value) => {
        let config = printConfig();
        config.doorOpenState = value;
        _setPrintConfig(config);
    },
    getDoorOpenState: () => printConfig().doorOpenState,

    setIsHotbedForeignOn: (value) => {
        let config = printConfig();
        config.isHotbedForeignOn = value;
        _setPrintConfig(config);
    },
    getIsHotbedForeignOn: () => printConfig().isHotbedForeignOn,

    setIsSDCardCache3mfOn: (value) => {
        let config = printConfig();
        config.isSDCardCache3mfOn = value;
        _setPrintConfig(config);
    },
    getIsSDCardCache3mfOn: () => printConfig().isSDCardCache3mfOn,

    setIsAllowSkipPartsOn: (value) => {
        let config = printConfig();
        config.isAllowSkipPartsOn = value;
        _setPrintConfig(config);
    },
    getIsAllowSkipPartsOn: () => printConfig().isAllowSkipPartsOn,
};



var [layerNum, layerNumChanged, _setLayerNum] = Binding.makeBinding(-1);
var [totalLayerNum, totalLayerNumChanged, _setTotalLayerNum] = Binding.makeBinding(-1);

var layerActions = {
    setCurrentLayer: () => {
        _setLayerNum(X1Plus.PrintManager.currentTask.layerNum);
    },
    setTotalLayer: () => {
        _setTotalLayerNum(X1Plus.PrintManager.currentTask.totalLayerNum);
    }
};

var [taskProgress, taskProgressChanged, _setTaskProgress] = Binding.makeBinding(-1);
var [runout, runoutChanged, _setRunout] = Binding.makeBinding(false);
var [printPaused, printPausedChanged, _setPrintPaused] = Binding.makeBinding(false);
var [printIdle, printIdleChanged, _setPrintIdle] = Binding.makeBinding(false);
var [printState, printStateChanged, _setPrintState] = Binding.makeBinding(false);
var [printSpeed, printSpeedChanged, _setPrintSpeed] = Binding.makeBinding(100);
var [speedRampStatus, speedRampStatusChanged, _setSpeedRampStatus] = Binding.makeBinding([]);
var [speedRamping, speedRampingChanged, _setSpeedRamping] = Binding.makeBinding([]);

var printStatusActions = {
    setProgress: () => {
        _setTaskProgress(X1Plus.PrintManager.currentTask.progress);
    },
    updateRunout: () => {
        _setRunout(X1Plus.PrintManager.MS_FILAMENT_LOADED);
    },
    updatePaused: () => {
        _setPrintPaused(X1Plus.PrintManager.currentTask.stage === X1Plus.PrintTask.PAUSED);
    },
    updateIdle: () => {
        _setPrintIdle(X1Plus.PrintManager.currentTask.stage < X1Plus.PrintTask.WORKING && !X1Plus.DeviceManager.power.inputIdle);
    },
    updatePrintState: () => {
        _setPrintState(X1Plus.PrintManager.currentTask.state);
    },
    updatePrintSpeed: () => {
        var _printSpeed = printSpeed();
        _setPrintSpeed(X1Plus.PrintManager.currentTask.printSpeed);
    },
    setPrintSpeedGcode: (val) => {
        let gcode = X1Plus.GcodeGenerator.M2042(val);
        console.log(gcode);
        X1Plus.sendGcode(gcode);
        return gcode;
    },
    updateRampStatus: (layer,n,start,stop) => {
        let f = [layer, n, start, stop];
        _setSpeedRampStatus(f);
    },
    
};

var [sleep, sleepChanged, _setSleep] = Binding.makeBinding(false);
var [aboutToSleep, aboutToSleepChanged, _setAboutToSleep] = Binding.makeBinding(false);
var [isHomed, isHomedChanged, _setIsHomed] = Binding.makeBinding(false);

var deviceActions = {
    updateSleep: () => {
        _setSleep(X1Plus.DeviceManager.power.hasSleep);
        _setAboutToSleep(X1Plus.DeviceManager.power.aboutToSleep);
    },
    updateisHomed: () => {
        _setIsHomed((X1Plus.PrintManager.homedState & X1Plus.PrintManager.AXIS_HOMED_ALL) === X1Plus.PrintManager.AXIS_HOMED_ALL);
    }
};


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