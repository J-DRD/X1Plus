.pragma library
.import DdsListener 1.0 as JSDdsListener
.import X1PlusNative 1.0 as JSX1PlusNative
.import "Binding.js" as Binding

var X1Plus = null;

var _DdsListener = JSDdsListener.DdsListener;
var _X1PlusNative = JSX1PlusNative.X1PlusNative;



function createGcode(command, params = {}) {
    let gcode = `${command}`;
    for (const [key, value] of Object.entries(params)) {
        if (value !== '') {
            gcode += ` ${key}${value}`;
        }
    }
    return `${gcode}\n`;
}


// var placeholders = {
//     layer_num
//     layer_z
//     max_layer_z
//     toolchange_count
//     old_retract_length
//     new_retract_length
//     old_filament_temp
//     new_filament_temp
//     x_after_toolchange
//     y_after_toolchange
//     z_after_toolchange
//     first_flush_volume
//     second_flush_volume
//     old_filament_e_feedrate
//     new_filemnt_e_feedrate
//     flush_length: (idx) => {return `{flush_length_${idx}}`},
//     filament_extruder_id: () => {return `{filament_extruder_id}`},
//     toolchange_z: () => {return `{toolchange_z}`},
// }


/* update timeline */
function M73(val1, val2) {
    return `M73 P${val1} R${val2}\n`;
}

var G28 = { /* homing */
    xyz: () => {
        return `G28\n`;
    },
    z_low_precision: () => {
        return `G28 Z P0\n`;
    },
    z_low_precision_heated: (temp) => {
        return `G28 Z P0 T${temp}\n`;
    },
    xy: () => {
        return `G28 X\n`;
    }
}

/* endstops */
function M211({ x = '', y = '', z = ''}) {
    return this.createGcode('M211', { X: x, Y: y, Z: z});
}

/* toggle mesh compensation */
function G292(enabled = 1) {
    return `G29.2 S${enabled}\n`;
}

/* bed mesh calibration */
function G29(){
    return "G29\n";
}
/* absolute coords */
function G90() {
    return "G90\n";
}

/* relative coords */
function G91() {
    return "G91\n";
}


/* heat bed + wait */
function M140(temp) {
    return this.createGcode('M140', {S: temp});
}

/* heat bed */
function M190(temp) {
    return this.createGcode('M190', {S: temp});}

/* heat nozzle + wait */
function M109(temp) {
    return this.createGcode('M109', {S: temp});
}
/* heat nozzle */
function M104(temp) {
    return this.createGcode('M104', {S: temp});
}

/* save settings */
function M500() {
    return 'M500\n';
}

/* stepper current */
function M17(x, y, z) {
    return this.createGcode('M17', {X: x, Y: y, Z: z});
}

/* toggle vibration compensation */
function M975(enabled = true) {
    const status = enabled ? '1' : '0';
    return `M975 S${status}\n`;
}

/* k value */
function M900(k, l, m) {
    return this.createGcode('M900', {K: k, L: l, M: m});
}

var speed_interp = {
    speed_fraction: (speedPercentage) => { return Math.floor(10000/speedPercentage)/100},
    acceleration_magnitude: (speedFraction) => {return Math.exp((speedFraction - 1.0191) / -0.814)},
    feed_rate: (speedPercentage) => {return (0.00006426)*speedPercentage ** 2 + (-0.002484)*speedPercentage + 0.654},
    level: (accelerationMagnitude) => {return (1.549 * accelerationMagnitude ** 2 - 0.7032 * accelerationMagnitude + 4.0834)}
}
/**
 * Generates G-code based on the print speed level.
 * 
 * @param {number} speedPercentage The desired print speed as a percentage of the normal speed (100%).
 *                                 Accepts: 50 (Silent), 100 (Normal), 125 (Sport), 166 (Luda)
 * @returns {string} The G-code string to set print speed
 */
function M2042(speedPercentage) {
    if (speedPercentage <30 || speedPercentage > 180){
        speedPercentage = 100;
    }
    // Convert percentage to a fraction, use Math.floor() to keep our target % the same as Bambu's reported %
    var speedFraction = speed_interp.speed_fraction(speedPercentage);
    
    // Calculate acceleration magnitude from speed fraction based on log trendline
    var accelerationMagnitude = speed_interp.acceleration_magnitude(speedFraction);
    
    // Interpolate feed rate from R
    var feedRate = speed_interp.feed_rate(speedPercentage);
    // level from acceleration magnitude (not necessary)
    var level = speed_interp.level(accelerationMagnitude);
    
    return [
        `M204.2 K${accelerationMagnitude.toFixed(2)}`,
        `M220 K${feedRate.toFixed(2)}`,
        `M73.2 R${speedFraction}`,
        M1002.set_gcode_claim_speed_level(Math.round(level))
    ].join(" \n") + "\n";
}

/* motion control */
function G0({ x = '', y = '', z = '', accel = '' }) {
    return this.createGcode('G0', { X: x, Y: y, Z: z, F: accel });
}

function G1({ x = '', y = '', z = '', e = '', accel = '' }) {
    return this.createGcode('G1', { X: x, Y: y, Z: z, E: e, F: accel });
}

var M1002 = { /* claim action and judge flag */
    gcode_claim_action: (code) => `M1002 gcode_claim_action ${code}\n `,
    judge_flag: (code) => `M1002 judge_flag ${code}\n `,
    set_gcode_claim_speed_level: (code) => `M1002 set_gcode_claim_speed_level ${code}\n `,
}

// const judge_flags = [
//     "g29_before_print_flag",
//     "xy_mech_mode_sweep_flag",
//     "do_micro_lidar_cali_flag",
//     "timelapse_record_flag"
// ];
// const claim_actions = [
//     "0 Clear screen of messages",
//     "1 Auto bed levelling",
//     "2 Heatbed preheating",
//     "3 Sweeping XY mech mode",
//     "4 Changing filament",
//     "5 M400 pause",
//     "6 Paused due to filament runout",
//     "7 Heating hotend",
//     "8 Calibrating extrusion",
//     "9 Scanning bed surface",
//     "10 Inspecting first layer",
//     "11 Identifying build plate type",
//     "12 Calibrating Micro Lidar",
//     "13 Homing toolhead",
//     "14 Cleaning nozzle tip",
//     "15 Checking extruder temperature",
//     "16 Paused by the user",
//     "17 Pause due to the falling off of the tool head’s front cover",
//     "18 Calibrating the micro lidar",
//     "19 Calibrating extruder flow",
//     "20 Paused due to nozzle temperature malfunction",
//     "21 Paused due to heat bed temperature malfunction"
// ];

/* fast sweep */
function M9703(axis = 0, a = 7, b = 30, c = 80, h = 0, k = 0) 
{
    return h > 0 ? `M970.3 Q${axis} A${a} B${b} C${c} H${h} K${k}\n` : `M970.3 Q${axis} A${a} B${b} C${c} K${k}\n`;
}
/* frequency sweep */
function M970({axis, a, f_low, f_high, h, k})
{
    return h ? `M970 Q${axis} A${a} B${f_low} C${f_high} H${h} K${k}\n`
             : `M970 Q${axis} A${a} B${f_low} C${f_high} K${k}\n`;
}
/* curve fitting for vibration compensation */
function M974(axis = 0) 
{
    return `M974 Q${axis} S2 P0\n`;
}


function M400(sec = 0) /* pause */
{
    return sec > 0 ? `M400 S${sec}\n` : `M400\n`;
}

function G4(sec = 90) /* pause */
{
    let gcode = '';
    const fullCycles = Math.floor(sec / 90);
    const remainder = sec % 90;

    for (let i = 0; i < fullCycles; i++) {
        gcode += 'G4 S90\n';
    }
    if (remainder > 0) {
        gcode += `G4 S${remainder}\n`;
    }
    return gcode;
}

function M205({x , y , z , e }) /* set jerk limits */
{
    return createGcode('M205', {X: x, Y: y, Z: z, E: e});
}
function M9822() /* disable motor noise cancellation */
{
    return "M982.2 C0\n M982.2 C1\n";
}

var M106 = {/* fan control, val = 0 to 255 */
    part: (val) => `M106 P1 S${val}\n`,
    aux: (val) => `M106 P2 S${val}\n`,
    chamber: (val) => `M106 P3 S${val}\n`,
}


function M220() /* set feed rate (default = 100%) */
{
    return `M220 S100\n`;
}

function M221(s) /* set flow rate (default = 100%) */
{
    return `M221 S${s}\n`;
}

var M960 = { /* LED controls */
    laser_vertical: (val) => {
        return `M960 S1 P${val}\n`;
    },
    laser_horizontal: (val) => {
        return `M960 S2 P${val}\n`;
    },
    nozzle: (val) => {
        return `M960 S4 P${val}\n`;
    },
    toolhead: (val) => {
        return `M960 S5 P${val}\n`;
    },
    all: (val) => {
        return `M960 S0 P${val}\n`;
    }  
}

var M973 = {/* nozzle camera controls */
    off: () => {
        return `M973 S4\n`;
    },
    on: () => {
        return `M973 S3 P1\n`;
    },
    autoexpose: () => {
        return `M973 S1\n`;
    },
    expose: (image,val) => {
        return `M973 S${image} P${val}\n`
    },
    capture: (image,val) => {
        return `M971 S${image} P${val}\n`;
    }  
}

function M201(z){
    return `M201 Z${z}\n`;
}
function  M622(j){
    return `M622 J${j}\n`;
}
function  M623(){
    return 'M623\n';
}
function  M83(){ /* set extruder to relative */
    return 'M83\n';
}
function  M84(){ /* disable steppers */
    return 'M84\n';
}
function M412(s){/* toggle filament runout detection */
    return `M412 S${s}\n`;
}
function M302(p){/* enable cold extrusion  */
    return `M302 S70 P${p}\n`;
}

function G291(z_trim) {/* set z offset */
//z_trim = "{+0.00}"  or "{-0.04}" - string only!
    return `G29.1 Z{${z_trim}}\n`;
}

function M2012() {/* reset acceleration multiplier*/
    return `M201.2 K1.0\n`;
}


const GcodeLibrary = {
    calibration: {
        ABL: [
            () => M1002.gcode_claim_action(0),
            () => M622(1),
            () => M1002.gcode_claim_action(1),
            () => G29(),
            () => M400(0),
            () => M500(),
            () => M623()
        ],
        Vibration: (freq1, freq2, nozzleTemp, bedTemp) => {
            let gcode = [
                () => M1002.gcode_claim_action(13),
            ];
            let mid = Math.floor((freq2-freq1)*0.5);
            if (nozzleTemp > 0) {gcode.push(() => M109(nozzleTemp))}
            if (bedTemp > 0) { gcode.push(() => M140(bedTemp))}
            gcode.push(
                () =>  M73(0,3),
                () =>  M201(100),
                () =>  G90(),
                () =>  M400(1),
                () =>  M17(1.2, 1.2, 0.75),
                () =>  G28.xyz,
                () =>  G0({x: 128, y: 128, z: 5, accel: 2400}),
                () =>  M201(1000),
                () =>  M400(1),
                () =>  M1002.gcode_claim_action(3),
                () =>  M970({axis: 1, a: 7, f_low: freq1    , f_high: mid, k: 0}),
                () =>  M73(25,3),
                () =>  M970({axis: 1, a: 7, f_low: mid + 1, f_high: freq2, k: 1}),
                () =>  M73(50,2),
                () =>  M974(1),
                () =>  M970({axis: 0, a: 9, f_low: freq1    , f_high: mid, h: 20, k: 0}),
                () =>  M73(75,1),
                () =>  M970({axis: 0, a: 9, f_low: mid + 1, f_high: freq2, k: 1}),
                () =>  M73(100,0),
                () =>  M974(0),
                () =>  M500(),
                () =>  M975(true),       
                () =>  G0({x: 65, y: 260, z: 10, accel: 1800}),     
                () =>  M400(1),
                () =>  M140(0),
                () =>  M109(0),
                () => M1002.gcode_claim_action(0),
                ); 
            return gcode         
        },
        Tramming:  {
            exit:[
                    () =>  M1002.gcode_claim_action(254),
                    () =>  G1({x: 128, y: 128, z: 1}),
                    () =>  M400(0),
                    () =>  M1002.gcode_claim_action(0),
                ],
            prepare:[
                    () =>  M1002.gcode_claim_action(254),
                    () =>  M17(1.2, 1.2, 0.75),
                    () =>  G90(),
                    () =>  M83(),
                    () =>  G28.xyz,
                    () =>  G1({x: 128, y: 128, z: 1}),
                    () =>  G292(0),
                    () =>  M1002.gcode_claim_action(1),
                ],
            rear_center: [
                    () =>  M1002.gcode_claim_action(254),
                    () =>  G1({x: 134.8, y: 242.8, z: 0.4, accel: 3600}),
                    () =>  M400(0),
                    () =>  M1002.gcode_claim_action(1),
                ],
            front_left: [
                    () =>  M1002.gcode_claim_action(254),
                    () =>  G1({x: 33.2, y: 13.2, z: 0.4, accel: 3600}),
                    () =>  M400(0),
                    () =>  M1002.gcode_claim_action(1),
                ],
            front_right:[
                    () =>  M1002.gcode_claim_action(254),
                    () =>  G1({x: 222.8, y: 13.2, z: 0.4, accel: 3600}),
                    () =>  M400(0),
                    () =>  M1002.gcode_claim_action(1),
                ]
        }
        
    },
    macros: {
        ColdPull: {
            prepare: [
                () => G28.z_low_precision,
                () => M83(),
                () => M302(1)
            ],
            load: [
                () => G1({e:10,accel:100}),
            ],
            flush: (temp2,temp3) => [
                () => G1({e:60,accel:100}),
                () => M106.aux(255),
                () => M106.part(255),
                () => M109(temp2),
                () => G1({e:10,accel:100}),
                () => M104(temp3)
            ],
            pulse: (n,m) => {
                let gcode = [
                    () => G1({e:1,accel:1200}),
                    () => G1({e:-1,accel:1200}),
                ]
                var _gcode = [];
                for (let i = 0; i < n; i++) {
                    for (let j = 0; j < m; j++) {
                        _gcode.push(gcode);
                    }
                    _gcode.push(()=>G4(1));
                }
            },
            pull: (temp4) => [
                () => G1({e:-100,accel:1200}),
            ],
            exit: [
                () => M104(0),
                () => M1002.gcode_claim_action(0),
                () => M106.aux(0),
                () => M106.part(0),
                () => M84()
            ]
        },
        Preheat:{
            home: () => [
                () => G28.z_low_precision,
                () => G0({z:5,accel:1200}),
                
            ],
            on: (temp=100) => [
                () => M140(temp),
                () => M106.aux(255),
                () => M106.part(255),
                
            ],
            off: () => [
                () => M140(0),
                () => M106.aux(0),
                () => M106.part(0),             
            ]
        },
        rampSpeedLevel: (start_speed,end_speed,steps) => {
            let levels = [];
            if (!Number.isInteger(steps) || steps % 2 !== 0) {
                console.log("Steps must be even numbered")
                return [];
            }
            let step = (end_speed - start_speed) / (steps - 1); 
        
            for (let i = 0; i < steps; i++) {
                let current_speed = start_speed + (step * i);
                levels.push(Math.round(current_speed));
            }
            return levels;
        }
        
    },
    controls: {
        settings:{
            z_offset: (offset)=> G291(offset),
            z_offset_default: () => G291("+0.00"),
            k_value: (k,l,m) => M900(k,l,m),
            save: () => M500(),
            ABL: (enabled) => G292(enabled)
        },    
        motion:{
            move: (_x,_y,_z,_e,_accel) => (e !== '' && e > 0) ? () => G1({x:_x,y:_y,z:_z,e:_e, accel: _accel}) : () => G0({x: X, y: Y, z: Z, accel: Accel}),
            disable_steppers: () => M84(),
            reset_flow_rate: () => M220(),
            jerk_limits: (_x,_y,_z,_e) => M205({x:_x,y:_y,z:_z,e:_e}),
            moveTo: {
                done: (_accel=1200)=> G0({x: 65,y:260,z:10, accel:_accel}),
                center: (_accel=1200)=> G0({x: 128,y:128,z:5, accel:_accel}),
                chessboard: (_accel=1200)=> G0({x: 240,y:90,z:8, accel:_accel}),
            },
            default_stepper_current: () => M17({x:1.2,y:1.2,z:0.75}),
            relative: () => G91(),
            absolute: () => G90(),
        },
        extruder:{
            extrude: (_e, _accel) => G1({e: _e, accel:_accel}),
            cold_extrusion: (enabled) => M302(enabled),
            runout_detection: (enabled) => M412(enabled),
            relative_extrusion: () => M83()
        }
    }
};

function compileGcode(commands) {
    return commands.map(command => command()).join('');
}

function compileAndSendGcode(commands,seq_id) {
    X1Plus.sendGcode(compileGcode(commands),seq_id);
}
//USAGE:
//var GcodeLibrary = X1Plus.GcodeGenerator;
//var commands = GcodeLibrary.Commands;
//const trammingGcode = GcodeLibrary.compileGcode(commands.calibration.Tramming.exit);