.pragma library
.import "Binding.js" as Binding
.import X1PlusNative 1.0 as JSX1PlusNative
var X1Plus = null;

var _X1PlusNative = JSX1PlusNative.X1PlusNative;
var _settingsFile;

var [_db, _dbChanged, _setDb] = Binding.makeBinding(null);


/** setting = getSetting(jsonKey, defaultValue)
 * currently only returns the value of the binding. 
 * Once we have our own `forward` service that publishes DDS 
 * messages to MQTT, we can start publishing the output of getSetting
 * to DDS. This will provide HA/3rd party app/print farm users MQTT
 * access to settings
 */
function getSetting(key, defaultValue){
  return _db().key || X1Plus.DeviceManager.getSetting(key,defaultValue);
}


/** putSetting(jsonKey, value)
 * update property binding and publish the results to DDS
 * x1plusd will do the rest.
 */
function putSetting(key, val){
  let db = _db();
	//X1Plus.DeviceManager.putSetting(key, val);
  db.key = val;
  _setDb(db);
  X1Plus.DDS.publisher.put_setting(key,val,0); 
}   



function loadDatabase(reload=false){
  let db = _db();
  if(!reload && db != null) return;
  
  if (!X1Plus.fileExists(_settingsFile)){
    console.log("[x1p] Settings file doesn't exist");
    //send DDS message to tell x1plusd.py to make us a new file?
  }
  try {
    db = X1Plus.loadJson(_settingsFile) || {};
    _setDb(db);
  } catch (e) {
    console.log("[x1p] Failed to load settings file");
  }
}



//Leaving this here for reference only
// const migrate = {
//   cfw_rootpw: ""             [S70x1plus_sshd, DevicePage.qml],
//   cfw_shield: false          [S71x1plus_shield, DevicePage.qml],
//   cfw_sshd: false            [S70x1plus_sshd, DevicePage.qml],
//   cfw_passcode: ""           [ScreenLock.qml, ScreenLockPage.qml],
//   cfw_locktype: 0            [ScreenLock.qml, ScreenLockPage.qml],
//   cfw_lockscreen_image: ""   [ScreenLock.qml, ScreenLockPage.qml],
//   cfw_brightness: 100        [HardwarePage.qmll, Screen.qml ],
//   cfw_toolhead_led: true     [HardwarePage.qml, Screen.qml ],
//   cfw_vc: null               [VibrationComp.qml],
//   cfw_home_image: ""         [HomePage.qml, Home2Page.qml],
//   cfw_print_image: ""        [HomePage.qml, Home2Page.qml],
//   cfw_default_console: false  [ConsolePage.qml],
// }