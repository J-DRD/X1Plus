import QtQuick 2.12
import QtQuick.Layouts 1.12
import QtQuick.Controls 2.12
import QtQuick.VirtualKeyboard 2.1
import X1PlusNative 1.0
import UIBase 1.0
import Printer 1.0
import '../X1Plus.js' as X1Plus
import "../printer"
import "qrc:/uibase/qml/widgets"
import ".."

Item {
    id: consoleComp
    property var cmdHistory:[]
    property var historyPlaceholder:-1

    property bool gcodeCmd: DeviceManager.getSetting("cfw_default_console",false);
    property alias inputText: inputTextBox.text;
    
    property var gcodes: ["History",
                "ABL On",
                "Toolhead:<br>Absolute",
                "Toolhead:<br>Relative",
                "Disable<br>Endstops",
                "Extruder:<br>Retract",
                "Extruder:<br>Extrude",
                "Fan Speed:<br>Aux",
                "Fan Speed:<br>Chamber",
                "Fan Speed:<br>Part",
                "Gcode<br>Claim<br>Action",
                "Home:<br>XYZ",
                "Home:<br>XY",
                "Home:<br>Low<br>Precision",
                "Input<br>Shaper<br>On/Off",
                "Jerk<br>Limits",
                "K-value",
                "LiDAR:<br>Laser 1",
                "LiDAR:<br>Laser 2",
                "LiDAR:<br>Camera on",
                "LiDAR:<br>Camera off",
                "LiDAR:<br>Camera<br>exposure",
                "LiDAR:<br>Camera<br>capture",
                "LEDs:<br>Nozzle",
                "LEDs:<br>Toolhead",
                "Move<br>Bed Down",
                "Move<br>Bed Up",
                "Move<br>Toolhead",
                "Noise<br>Cancellation<br>Off",
                "Pause<br>(G4)",
                "Pause<br>(M400)",
                "Print Speed:<br>50%",
                "Print Speed:<br>100%" ,
                "Print Speed:<br>120%",
                "Print Speed:<br>166%",
                "Timeline<br>Update",
                "Reset<br>Feed Rate",
                "Reset<br>Flow Rate",
                "Save<br>(M500)",
                "Stepper<br>Current",
                "Temp:<br>Nozzle",
                "Temp:<br>Bed",
                "Temp:<br>Wait for<br>nozzle",
                "Temp:<br>Wait for<br>bed"
                ]
    property var gcode_actions: ["history",
                X1Plus.GcodeGenerator.G292(1),
                X1Plus.GcodeGenerator.G90(),
                X1Plus.GcodeGenerator.G91(),
                X1Plus.GcodeGenerator.M211({x:0,y:0,z:0}),
                X1Plus.GcodeGenerator.G1({e: -5, accel: 300}),
                X1Plus.GcodeGenerator.G1({e: 5, accel: 300}),
                X1Plus.GcodeGenerator.M106.aux(255),
                X1Plus.GcodeGenerator.M106.chamber(255),
                X1Plus.GcodeGenerator.M106.part(255),
                X1Plus.GcodeGenerator.M1002.gcode_claim_action(0),
                X1Plus.GcodeGenerator.G28.xyz(),
                X1Plus.GcodeGenerator.G28.xy(),
                X1Plus.GcodeGenerator.G28.z_low_precision(),
                X1Plus.GcodeGenerator.M975(true),
                X1Plus.GcodeGenerator.M205({x:0,y:0,z:0, e:0}),
                X1Plus.GcodeGenerator.M900(0.01,1,1000),
                X1Plus.GcodeGenerator.M960.laser_vertical(1),
                X1Plus.GcodeGenerator.M960.laser_horizontal(1),
                X1Plus.GcodeGenerator.M973.on(),
                X1Plus.GcodeGenerator.M973.off(),  
                X1Plus.GcodeGenerator.M973.expose(2,600),
                X1Plus.GcodeGenerator.M973.capture(1,1),
                X1Plus.GcodeGenerator.M960.nozzle(1),
                X1Plus.GcodeGenerator.M960.toolhead(1),
                X1Plus.GcodeGenerator.G91() + '\\n' + X1Plus.GcodeGenerator.G0({z:10,accel:1200}), 
                X1Plus.GcodeGenerator.G91() + '\\n' + X1Plus.GcodeGenerator.G0({z:-10,accel:1200}), 
                X1Plus.GcodeGenerator.G0({x:228,y:253,z:8,accel:1200}),
                X1Plus.GcodeGenerator.M9822(),
                X1Plus.GcodeGenerator.M400(50),
                X1Plus.GcodeGenerator.G4(50),
                X1Plus.GcodeGenerator.M2042(50),
                X1Plus.GcodeGenerator.M2042(100),
                X1Plus.GcodeGenerator.M2042(124),
                X1Plus.GcodeGenerator.M2042(166),
                X1Plus.GcodeGenerator.M73(0,18),
                X1Plus.GcodeGenerator.M221(100),
                X1Plus.GcodeGenerator.M220(),
                X1Plus.GcodeGenerator.M500(),
                X1Plus.GcodeGenerator.M17(0.3,0.3,0.3),
                X1Plus.GcodeGenerator.M104(250),
                X1Plus.GcodeGenerator.M140(100),
                X1Plus.GcodeGenerator.M109(250),
                X1Plus.GcodeGenerator.M190(55)
                ]
    property var cmds: ["History"," $ ","  ( )  "," ` ", "  { }  ","  |  ","  -  ","  &  ","  /  ", "reboot","awk ","cat ", "chmod ","chown ", "chroot", "cp ","date -s ", "dd ", "df ", "echo ","grep", "head ","ifconfig", "iptables ", "kill ","killall ","ln -s","ls -l ","mount ","mv ","pgrep ","pidof","ping -c 1","poweroff","print ","ps aux ", "ps -ef ", "pwd", "remount", "rm ", "sed","sort","tar","test","touch ", "uname -a"]
    property var outputText:""
    property string savePath
    property string space: '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'
    
    MarginPanel {
        id: outputPanel
        width: 1130
        height: parent.height-80 - 150
        anchors.left: parent.left
        anchors.top:  inputPanel.bottom
        anchors.right: parent.right
        bottomMargin: 16
        leftMargin: 26
        topMargin: 5
        rightMargin: 26

        ScrollView {
            id: termScroll
            anchors.top:parent.top
            anchors.topMargin: 18
            anchors.left:parent.left
            anchors.right: parent.right
            anchors.rightMargin: 18
            anchors.bottom: parent.bottom
            anchors.bottomMargin: 18
            anchors.leftMargin:18
            ScrollBar.vertical.interactive: true
            ScrollBar.vertical.policy: outputTextArea.height > termScroll.height ? ScrollBar.AlwaysOn : ScrollBar.AlwaysOff
            ScrollBar.horizontal.policy: ScrollBar.AsNeeded
            ScrollBar.horizontal.interactive: true
            clip: true
            TextArea {
                id: outputTextArea
                width: parent.width - 56
                textFormat: Qt.PlainText //RichText is way too slow on the printer
                readOnly: true
                font: outputText.length == 0 ? Fonts.body_24 : Fonts.body_18
                color: Colors.gray_100
                text: outputText
                placeholderText: gcodeCmd 
                    ? qsTr("This interface allows you to send G-code commands to the printer. You can enter commands " +
                        "with the virtual keyboard, or put together commands from the shortcut bar at the bottom of " +
                        "the screen. The printer's G-code parser is somewhat picky; here are some tips for how to placate " +
                        "it: ") +
                    "<br><br>" +
                    qsTr("Commands are case sensitive; the first character of a command is always a capital letter, " +
                        "followed by a number. For example, to set the aux fan to full speed, use M106 P2 S255:") +
                    "<br>" +
                    space + qsTr("M106: G-code command for fan control") + "<br>" +
                    space + qsTr("P2: parameter to select which fan (aux = 2)") + "<br>" +
                    space + qsTr("S255: parameter to set fan speed (0 to 255)") +
                    "<br><br>" +
                    qsTr("For multi-line commands, each G-code command must be separated by the newline escape " +
                        "sequence, \\n. For example:") +
                    "<br>" +
                    space + qsTr("M106 P2 S255\\nG4 S5\\nM106 P2 S0") +
                    "<br><br>" +
                    space + qsTr("Aux fan to 255 -> Wait 5 sec -> Aux fan to 0")
                    : qsTr("This interface allows you to run commands on your printer as root. You can enter commands " +
                        "with the virtual keyboard, or put together commands from the shortcut bar at the bottom of " +
                        "the screen. Commands are executed synchronously, so long-running commands or commands " +
                        "that require user input may hang the UI; use caution! This is intended as a quick diagnostic " +
                        "tool, but for more intensive tasks, consider SSHing to the printer instead.") +
                    "<br><br>" +
                    qsTr("WARNING: It is possible to do permanent, irreversible damage to your printer from a root " +
                        "console. Do not enter commands unless you understand what you are typing.")

                placeholderTextColor: Colors.gray_300
            }
            function scroll(contentOffset){
                // NB: future versions of Qt Quick will have to use flickableItem here, not contentItem
                var maxOffset = outputTextArea.topPadding + outputTextArea.contentHeight + outputTextArea.bottomPadding - height;
                if (maxOffset < 0)
                    maxOffset = 0;
                
                // There is some kind of margin behavior in here that I do
                // not understand.  The `height` is actually 12px higher
                // than I measured it in GIMP.  And contentOffset ends up
                // getting off by 24px!  Life is too long to track down
                // idiosyncracies in old versions of Qt, though, so I sure
                // am not going to waste another single breath on it.
                contentOffset -= 24;
                if (contentOffset < 0)
                    contentOffset = 0;

                // console.log(`I would like to scroll to contentOffset = ${contentOffset}, maxOffset = ${maxOffset}, contentY = ${contentItem.contentY}, height = ${height}, contentItem.height = ${contentItem.height}, originY = ${contentItem.originY}, oTA contentHeight = ${outputTextArea.contentHeight}, oTA height = ${outputTextArea.height}`);
                contentItem.contentY = contentOffset > maxOffset ? maxOffset : contentOffset;
            }

        }

    }

    MarginPanel {
        id: hotkeysPane
        width: parent.width
        height: 120
        anchors.left: parent.left
        anchors.top:  outputPanel.bottom
        anchors.bottom:parent.bottom
        anchors.right: parent.right
        rightMargin: 26
        leftMargin: 26
        topMargin: 5
        bottomMargin:18

        ListView {
            id: hotkeysList
            anchors.top: hotkeysPane.top
            anchors.topMargin: 2   
            width: parent.width
            height: 105
            orientation: ListView.Horizontal
            model: gcodeCmd ? gcodes : cmds
            clip:true
            delegate: Item {
                id: itm
                width: (index == 0) ? 100 : gcodeCmd ? 130 : (index < 8) ? 70 : 130
                height: hotkeysList.height
                ZButton {
                    text: modelData
                    width: parent.width
                    height: hotkeysList.height-10
                    type: ZButtonAppearance.Tertiary
                    textSize: 26
                    textColor: Colors.gray_300
                    backgroundColor: "transparent_pressed"
                    borderColor: "transparent"
                    //cornerRadius: width / 2
                    onClicked: {
                        if (index == 0 ){
                            if (cmdHistory.length == 0) return;
                            
                                inputText = cmdHistory[historyPlaceholder];
                                historyPlaceholder += -1;
                                if (historyPlaceholder < 1) {
                                    historyPlaceholder = cmdHistory.length - 1;
                                }
                        } else {
                            if (gcodeCmd){
                                if (inputText.trim().length > 0) inputText += "\\n";
                                inputText += gcode_actions[index]
                            } else {
                                let cmd = cmds[index].trim().replace("<br>","");
                                if (index < 9) inputText += inputText;
                                inputText += cmd;
                            }
                        }
                    }
                }


                Rectangle {
                    width: 1
                    height: parent.height-20
                    anchors.left: parent.left
                    color: "#606060"
                    visible: index >0 && itm.width > 1//< model.count - 1 // Hide for the last item
                
                }
            }

            ScrollBar.horizontal: ScrollBar {
                policy: ScrollBar.AlwaysOn
            }

            ScrollBar.vertical: ScrollBar {
                policy: ScrollBar.AlwaysOff
            }
        }
    }

    function timestamp(offset){
        const now = new Date();
        now.setDate(now.getDate()-offset);
        const year = now.getFullYear().toString().slice(2);
        const month = (now.getMonth()+1).toString().padStart(2,'0');
        const day = now.getDate().toString().padStart(2,'0');
        const hrs = now.getHours().toString().padStart(2,'0');
        const mins = now.getMinutes().toString().padStart(2,'0');
        const ms = now.getSeconds().toString().padStart(2,'0');
        return hrs + mins + ms;
    }
    function sendCommand(str){
        console.log("[x1p] executing command ", str);
        try {
            let rs = X1PlusNative.popen(`${str}`);
            console.log("[x1p] executed command ", rs);
            return rs;
        } catch (e) {
            console.log("[x1p] error executing command", e);
            return "";
        }
    }
    MarginPanel{
        id:inputPanel
        property var lastCmd:""
        width: parent.width
        height:80
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        rightMargin: 26
        leftMargin: 26
        topMargin: 26

        Rectangle {
            id: consoleToggle
            anchors.verticalCenter: inputTextBox.verticalCenter
            anchors.left: parent.left
            anchors.leftMargin:60
            //anchors.leftMargin: -5
            height: 70
            width: height * 1.9
            radius: height / 2
            color: Colors.gray_800
            border.color: Colors.gray_500
            border.width: 2
            
            Rectangle {
                width: height
                height: parent.height
                radius: height / 2
                color: Colors.gray_500
                border.color: Colors.gray_400
                border.width: 2
                anchors.verticalCenter: parent.verticalCenter
                x: gcodeCmd ? parent.width - width : 0
                Behavior on x { PropertyAnimation {} }
            }
            
            MouseArea {
                anchors.fill: parent
                onClicked: {
                    gcodeCmd = !gcodeCmd;
                    outputText = "";
                    inputText = "";
                    DeviceManager.putSetting("cfw_default_console", gcodeCmd);
                }
            }
            
            Image {
                source: gcodeCmd ? "../../icon/components/console_shell.svg" : "../../icon/components/console_shell_active.svg"
                height: parent.height * 0.6
                width: height
                anchors.verticalCenter: parent.verticalCenter
                x: parent.height / 2 - height / 2
            }
            
            Image {
                source: gcodeCmd ? "../../icon/components/console_gcode_active.svg" : "../../icon/components/console_gcode.svg"
                height: parent.height * 0.6
                width: height
                anchors.verticalCenter: parent.verticalCenter
                x: parent.width - parent.height / 2 - height / 2
            }
        }

        TextField {
            id: inputTextBox
            height: 80
            anchors.left: consoleToggle.right
            anchors.leftMargin: 0 - leftInset + 15
            anchors.right: enterBtn.left
            anchors.rightMargin:20 - rightInset
            font: Fonts.body_28
            color: Colors.gray_200
            selectByMouse: true
            text: ""//inputText
            verticalAlignment: TextInput.AlignVCenter
            inputMethodHints: gcodeCmd ? Qt.ImhAutoUppercase | Qt.ImhPreferUppercase | Qt.ImhPreferNumbers
                                | Qt.ImhSensitiveData | Qt.ImhNoPredictiveText | Qt.ImhLatinOnly
                                : Qt.ImhNoAutoUppercase | Qt.ImhPreferLowercase | Qt.ImhPreferNumbers
                                | Qt.ImhSensitiveData | Qt.ImhNoPredictiveText | Qt.ImhLatinOnly
            placeholderText: gcodeCmd ? qsTr("enter a G-code command")
                                      : qsTr("enter a shell command to run as root")
            placeholderTextColor: Colors.gray_400
            background: Rectangle {
                color: Colors.gray_800
                radius: height / 4
            }
            leftInset: -20
            rightInset: -20
            Binding on text {
                value: inputText
            }
        }

        ZButton { 
            id: enterBtn
            icon: "../../icon/components/console_enter.svg"
            type: ZButtonAppearance.Secondary
            anchors.right: exportBtn.left 
            anchors.rightMargin: 10
            anchors.verticalCenter:inputPanel.verticalCenter
            iconSize: 80
            width: 60
            //cornerRadius: width / 2
            property string out
            property bool printing: PrintManager.currentTask.stage >= PrintTask.WORKING
            onClicked: {
                var inputCmd = inputText.trim();
                if (inputCmd.length <1) return;
                inputCmd = inputCmd.replace(/\\n/g, '\n  ');
                
                if (gcodeCmd){
                    
                    try {
                        if (printing) {
                            out = qsTr("Printer is running! Cannot execute gcode now");
                        } else {
                            X1Plus.sendGcode(inputCmd);
                        }
                    } catch (e){
                        
                    }
                    out = qsTr(">Gcode command published to device\n  ");
                }  else {
                    
                    out = sendCommand(inputCmd);
                    inputPanel.lastCmd= inputCmd;
                    

                }
                cmdHistory.push(inputCmd);
                historyPlaceholder = cmdHistory.length-1;
                if (outputText != "")
                    outputText += "\n\n";
                var origHeight = outputText == "" ? 0 : outputTextArea.contentHeight;
                var ts = timestamp(0) + "[root]:";
                outputText += ts + inputCmd  + "\n" + out;
                if (!gcodeCmd) {
                    termScroll.scroll(origHeight);
                }
                inputText = "";
            }
        }


        ZButton{
            id:exportBtn
            icon:"../../icon/components/export.svg"
            iconSize: 50
            width: 50

            anchors.right:parent.right
            anchors.rightMargin:26
            anchors.top:parent.top
            anchors.topMargin:12
            type: ZButtonAppearance.Secondary
            onClicked: {
    
                dialogStack.popupDialog(
                        "TextConfirm", {
                            name: gcodeCmd ? qsTr("Export console log"):qsTr("Export Gcode macro"),
                            type: TextConfirm.YES_NO,
                            defaultButton: 0,
                            text: qsTr("Export console output to a log file?"),
                            onYes: function() {
                                if (gcodeCmd) {
                                    pathDialog(`/mnt/sdcard/x1plus/gcode_${timestamp(0)}.log`,savePath);                 
                                } else {
                                    pathDialog(`/mnt/sdcard/x1plus/console_${timestamp(0)}.log`,savePath);                 
                                }
                                                        
                            },
                        })
            }
        }        
    }

    function pathDialog(inputtxt){
            dialogStack.push("InputPage.qml", {
                                input_head_text : qsTr("Save console output to:"),
                                input_text : inputtxt,
                                max_input_num : 50,
                                isUsePassWord : false,
                                isInputShow : true,
                                isInputting_obj : rect_isInputting_obj,
                                output_obj : inputText});    
        }
    QtObject {
        id: rect_isInputting_obj
        property bool isInputting: false
      
        onIsInputtingChanged: {
            if(!isInputting){
                if (!savePath== ""){
                    console.log(`[x1p] saving console log ${savePath}`);
                    X1PlusNative.saveFile(savePath, outputTextArea.text);
                }
    
                
            }
        }
    }
    Item {
        X1PBackButton {
            id: backBtn
            onClicked: { 
                consoleComp.parent.pop();
            }
        }
    }   
}