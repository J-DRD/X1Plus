.pragma library
.import DdsListener 1.0 as JSDdsListener
.import X1PlusNative 1.0 as JSX1PlusNative
.import "Binding.js" as Binding

var X1Plus = null;

var _DdsListener = JSDdsListener.DdsListener;
var _X1PlusNative = JSX1PlusNative.X1PlusNative;

var [_db, _dbChanged, _setDb] = Binding.makeBinding({});
const _settingsPath;
const _settingsFile = "settings.json";


/**
 * DDS topic: defined as device/x1plus/request and device/x1plus/report in x1plusd.py
* however the subtopic we have interposed is device/x1plus. all custom subtopics must be added to interpose.cpp! 
* Solution #1: Use the topic device/x1plus with no subtopics
* Solution #2: add subtopics to interpose, ie
*   if (i == (DdsNode_orig_get_sub_topic_count(p) + 2)) {
*        return "device/report/x1plus";
*   }
*/
const topicReq = X1Plus.DDS.ddsMsg.get_setting.topic;


var [callBackId, _callBackIdChanged, _setCallBackId] = Binding.makeBinding(-1);
/**
 * The most basic callback id system. +1 every time a message is published. 
 * We shouldn't generate enough messages to require anything more complex
 */
function nextCallBackId() {
  let cId = callBackId();
  if (cId == -1){
    _setCallBackId(0);
  } else {
    _setCallBackId(callBackId()+1);
  }
}

/** setting = getSetting(jsonKey, defaultValue)
 * currently only returns the value of the binding. 
 * Once we have our own `forward` service that publishes DDS 
 * messages to MQTT, we can start publishing the output of getSetting
 * to DDS. This will provide HA/3rd party app/print farm users MQTT
 * access to settings
 */
function getSetting(key, defaultVal){
  return _db().key || defaultVal
}
X1Plus.getSetting = getSetting;


/** putSetting(jsonKey, value)
 * update property binding and publish the results to DDS
 * x1plusd will do the rest.
 */
function putSetting(key, val){
	X1Plus._DeviceManager.putSetting(key, val);
  _db().key = val;
  _setDb(_db());
  //X1Plus.DDS.publish(topic,messages.putSetting(key,val));
}   
X1Plus.putSetting = putSetting;


function loadDatabase(){
  let db = {}
  if (!X1Plus.fileExists(_settingsPath)){
    console.log("[x1p] Settings file doesn't exist");
  }
  try {
    db = X1Plus.loadJson(_settingsPath) || {};
    _setDb(db);
  } catch (e) {
    console.log("[x1p] Failed to load settings file");
  }
}

function awaken() {
  _settingsPath = X1Plus.printerConfigDir + _settingsFile;
  _X1PlusNative.system("mkdir -p " + _X1PlusNative.getenv("EMULATION_WORKAROUNDS") + _settingsPath);
	console.log("Settings.js awakening");
  loadDatabase();
}




//Leaving this here for reference only
// const migrate = {
//   cfw_rootpw: [S70x1plus_sshd, DevicePage.qml],
//   cfw_shield: [S71x1plus_shield, DevicePage.qml],
//   cfw_sshd: [S70x1plus_sshd, DevicePage.qml],
//   cfw_passcode: [ScreenLock.qml, ScreenLockPage.qml],
//   cfw_locktype: [ScreenLock.qml, ScreenLockPage.qml],
//   cfw_lockscreen_image: [ScreenLock.qml, ScreenLockPage.qml],
//   cfw_brightness: [HardwarePage.qmll, Screen.qml ],
//   cfw_toolhead_led: [HardwarePage.qml, Screen.qml ],
//   cfw_vc: [VibrationComp.qml],
//   cfw_home_image: [HomePage.qml, Home2Page.qml],
//   cfw_print_image: [HomePage.qml, Home2Page.qml],
//   cfw_default_console: [ConsolePage.qml],
// }