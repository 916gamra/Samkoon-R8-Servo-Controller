import React, { useState, useEffect, useRef } from 'react';
import { Role, ModbusState, calculateRegister } from '../types';
import { modbusClient } from '../lib/modbus';
import { 
  LogOut, 
  Usb, 
  Power, 
  AlertOctagon, 
  Settings2, 
  Save, 
  Activity, 
  Cpu, 
  Gauge, 
  Database, 
  Terminal, 
  Sliders, 
  RotateCcw,
  BookOpen
} from 'lucide-react';

interface DashboardProps {
  role: Role;
  onLogout: () => void;
}

export function Dashboard({ role, onLogout }: DashboardProps) {
  const [modbusState, setModbusState] = useState<ModbusState>({ isConnected: false });
  const [errorMsg, setErrorMsg] = useState("");
  
  // Real-time parameters monitored from Drive
  const [currentTorque, setCurrentTorque] = useState<number>(0);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [busVoltage, setBusVoltage] = useState<number>(0);
  const [lastErrorCode, setLastErrorCode] = useState<number>(0);
  const [torqueHistory, setTorqueHistory] = useState<number[]>(Array(20).fill(0));

  // Dynamic Parameter states
  const [torqueLimit, setTorqueLimit] = useState<string>("30");
  const [dwellTime, setDwellTime] = useState<string>("3.50");

  // Custom Register Programming tool states
  const [customGroup, setCustomGroup] = useState<string>("5");
  const [customParam, setCustomParam] = useState<string>("16");
  const [customValue, setCustomValue] = useState<string>("");
  const [writeToRam, setWriteToRam] = useState<boolean>(true);
  const [communicationLog, setCommunicationLog] = useState<string[]>([]);

  const isMonitoring = useRef(false);
  const SLAVE_ID = 1;

  const handleConnect = async () => {
    try {
      setErrorMsg("");
      addLog("محاولة الاتصال بالمنفذ التسلسلي (Baud Rate: 115200)...");
      await modbusClient.connect(115200);
      setModbusState({ isConnected: true });
      addLog("تم الاتصال بنجاح بالمنفذ التسلسلي.");
      startMonitoring();
    } catch (err: any) {
      console.error(err);
      let errorText = err.message || "فشل الاتصال! تحقق من الصلاحيات أو الكابل.";
      const msg = errorText.toLowerCase();
      if (msg.includes("permissions policy") || err.name === "SecurityError") {
        errorText = "Web Serial API محجوب في هذه النافذة. يرجى الضغط على 'Open in New Tab' ليعمل الاتصال.";
      } else if (msg.includes("failed to open")) {
        errorText = "فشل فتح المنفذ! قد يكون مشغولاً ببرنامج آخر أو الجهاز غير متصل. جرب إغلاق البرامج الأخرى وإعادة توصيل الكابل.";
      }
      setErrorMsg(errorText);
      addLog(`[خطأ اتصال] ${errorText}`);
      setModbusState({ isConnected: false });
    }
  };

  const handleDisconnect = async () => {
    isMonitoring.current = false;
    await modbusClient.disconnect();
    setModbusState({ isConnected: false });
    setCurrentTorque(0);
    setCurrentSpeed(0);
    setBusVoltage(0);
    addLog("تم قطع الاتصال بالدرايف.");
  };

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setCommunicationLog(prev => [`[${timestamp}] ${msg}`, ...prev.slice(0, 30)]);
  };

  // Pre-configured operation parameters
  const triggerStartCycle = async () => {
    if (!modbusState.isConnected) return;
    const vdiRegister = calculateRegister(9, 26, true);
    addLog(`إرسال أمر START: كتابة القيمة 1 في المسجل VDI1 (العنوان: 0x${vdiRegister.toString(16).toUpperCase()})`);
    const success = await modbusClient.writeSingleRegister(SLAVE_ID, vdiRegister, 1);
    if (success) {
      addLog("تم قبول أمر بدء الدورة الحركية بنجاح.");
    } else {
      addLog("[خطأ] فشل إرسال أمر بدء الدورة.");
    }
  };

  const triggerEmergencyStop = async () => {
    if (!modbusState.isConnected) return;
    const vdiRegister = calculateRegister(9, 26, true);
    addLog(`إرسال أمر STOP: كتابة القيمة 0 في المسجل VDI1 (العنوان: 0x${vdiRegister.toString(16).toUpperCase()})`);
    const success = await modbusClient.writeSingleRegister(SLAVE_ID, vdiRegister, 0);
    if (success) {
      addLog("تم قبول أمر إيقاف الطوارئ وفصل العزم.");
    } else {
      addLog("[خطأ] فشل إرسال إيقاف الطوارئ.");
    }
  };

  const applyTorqueLimit = async () => {
    if (!modbusState.isConnected) return;
    try {
      const limit = parseInt(torqueLimit);
      if (isNaN(limit)) return;
      
      const torqueReg = calculateRegister(3, 13, true);
      addLog(`تحديث حد العزم الأمامي P03-13: كتابة القيمة ${limit}% في العنوان: 0x${torqueReg.toString(16).toUpperCase()}`);
      const success = await modbusClient.writeSingleRegister(SLAVE_ID, torqueReg, limit);
      if (success) {
        addLog(`تم تحديث حد العزم بنجاح في الـ RAM إلى: ${limit}%`);
      } else {
        addLog("[خطأ] فشل كتابة بارامتر حد العزم.");
      }
    } catch (e: any) {
      addLog(`[خطأ كتابة] ${e.message}`);
    }
  };

  // Custom Register Programming
  const handleCustomRead = async () => {
    if (!modbusState.isConnected) return;
    try {
      const group = parseInt(customGroup);
      const param = parseInt(customParam);
      if (isNaN(group) || isNaN(param)) {
        alert("برجاء إدخال رقم مجموعة ورقم بارامتر صحيحين.");
        return;
      }
      
      const regAddress = calculateRegister(group, param, false);
      addLog(`قراءة سجل مخصص P${group.toString().padStart(2, '0')}-${param.toString().padStart(2, '0')} (العنوان: 0x${regAddress.toString(16).toUpperCase()})`);
      const result = await modbusClient.readHoldingRegisters(SLAVE_ID, regAddress, 1);
      if (result && result.length > 0) {
        setCustomValue(result[0].toString());
        addLog(`[قراءة ناجحة] القيمة الحالية للسجل هي: ${result[0]}`);
      } else {
        addLog("[خطأ] لم يتم استلام استجابة صحيحة من السيرفو.");
      }
    } catch (e: any) {
      addLog(`[خطأ قراءة] ${e.message}`);
    }
  };

  const handleCustomWrite = async () => {
    if (!modbusState.isConnected) return;
    try {
      const group = parseInt(customGroup);
      const param = parseInt(customParam);
      const val = parseInt(customValue);
      if (isNaN(group) || isNaN(param) || isNaN(val)) {
        alert("برجاء إدخال رقم مجموعة ورقم بارامتر وقيمة صحيحة.");
        return;
      }
      
      const regAddress = calculateRegister(group, param, writeToRam);
      const targetMemory = writeToRam ? "RAM" : "EEPROM";
      addLog(`كتابة سجل مخصص P${group.toString().padStart(2, '0')}-${param.toString().padStart(2, '0')} (العنوان: 0x${regAddress.toString(16).toUpperCase()} في ${targetMemory}) بقيمة ${val}`);
      const success = await modbusClient.writeSingleRegister(SLAVE_ID, regAddress, val);
      if (success) {
        addLog(`[كتابة ناجحة] تم حفظ القيمة ${val} في السجل بنجاح.`);
      } else {
        addLog("[خطأ] فشل كتابة القيمة في السجل.");
      }
    } catch (e: any) {
      addLog(`[خطأ كتابة] ${e.message}`);
    }
  };

  // Preset Macros Programming
  const runPresetMacro = async (name: string, group: number, param: number, value: number, toRam: boolean) => {
    if (!modbusState.isConnected) return;
    const address = calculateRegister(group, param, toRam);
    addLog(`تطبيق الماكرو [${name}]: كتابة ${value} في P${group.toString().padStart(2, '0')}-${param.toString().padStart(2, '0')} (العنوان: 0x${address.toString(16).toUpperCase()})`);
    const success = await modbusClient.writeSingleRegister(SLAVE_ID, address, value);
    if (success) {
      addLog(`تم تفعيل الماكرو [${name}] بنجاح.`);
    } else {
      addLog(`[خطأ] فشل تفعيل الماكرو [${name}].`);
    }
  };

  const startMonitoring = () => {
    if (isMonitoring.current) return;
    isMonitoring.current = true;
    
    const monitorLoop = async () => {
      const torqueFeedbackReg = calculateRegister(13, 21, false);
      const speedFeedbackReg = calculateRegister(13, 2, false);
      const busVoltageReg = calculateRegister(13, 15, false);
      const errorCodeReg = calculateRegister(9, 3, false);
      const clearDeviationReg = calculateRegister(9, 26, true);
      
      while (isMonitoring.current && modbusClient['port']) {
        try {
          // Poll Torque (P13-21)
          const resultTorque = await modbusClient.readHoldingRegisters(SLAVE_ID, torqueFeedbackReg, 1);
          if (resultTorque && resultTorque.length > 0) {
            const actualTorque = resultTorque[0];
            setCurrentTorque(actualTorque);
            setTorqueHistory(prev => [...prev.slice(1), actualTorque]);
            
            const limit = parseInt(torqueLimit) || 30;
            // Mechanical impact safety auto-clear deviation
            if (actualTorque >= limit - 2) {
               addLog(`[تنبيه حماية] ارتطام ميكانيكي مرصود (العزم: ${actualTorque}% >= الحد: ${limit}%). إرسال نبضة تصفير العداد Clear Deviation...`);
               await modbusClient.writeSingleRegister(SLAVE_ID, clearDeviationReg, 2);
               await new Promise(r => setTimeout(r, 400));
            }
          }

          // Delay to spacing polling & prevent line congestion
          await new Promise(r => setTimeout(r, 60));

          // Poll Speed (P13-02)
          const resultSpeed = await modbusClient.readHoldingRegisters(SLAVE_ID, speedFeedbackReg, 1);
          if (resultSpeed && resultSpeed.length > 0) {
            setCurrentSpeed(resultSpeed[0]);
          }

          await new Promise(r => setTimeout(r, 60));

          // Poll DC Bus Voltage (P13-15)
          const resultBus = await modbusClient.readHoldingRegisters(SLAVE_ID, busVoltageReg, 1);
          if (resultBus && resultBus.length > 0) {
            setBusVoltage(resultBus[0]);
          }

          await new Promise(r => setTimeout(r, 60));

          // Poll Error Code (P09-03)
          const resultErr = await modbusClient.readHoldingRegisters(SLAVE_ID, errorCodeReg, 1);
          if (resultErr && resultErr.length > 0) {
            setLastErrorCode(resultErr[0]);
          }

        } catch (e) {
          // Ignore polling errors
        }
        await new Promise(r => setTimeout(r, 150));
      }
    };
    
    monitorLoop();
  };

  useEffect(() => {
    return () => {
      isMonitoring.current = false;
      modbusClient.disconnect();
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#0F1115] font-sans text-[#E0E2E5] select-none" dir="rtl">
      {/* Top Bar */}
      <header className="flex h-16 items-center justify-between border-b border-[#2D3139] bg-[#161920] px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-[#3498DB] font-bold text-white">R8</div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold leading-tight tracking-wide">SAMKOON R8 SERVO CONTROLLER</h1>
            <p className="text-[10px] uppercase tracking-widest text-[#8E9299]">Industrial Modbus RTU Workspace v2.4</p>
          </div>
        </div>

        <div className="flex items-center gap-8" dir="ltr">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase text-[#8E9299]">Access Level</span>
            <span className={`text-sm font-bold ${role === 'Admin' ? 'text-[#3498DB]' : 'text-[#2ECC71]'}`}>
              {role === 'Admin' ? 'ADMIN MODE (تقني)' : 'USER MODE (عامل)'}
            </span>
          </div>
          
          <div className="h-8 w-[1px] bg-[#2D3139]"></div>
          
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase text-[#8E9299]">Connection</span>
              <span className={`text-sm font-semibold ${modbusState.isConnected ? 'text-[#2ECC71]' : 'text-[#E74C3C]'}`}>
                {modbusState.isConnected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>
            <div className={`h-3 w-3 rounded-full ${modbusState.isConnected ? 'bg-[#2ECC71] shadow-[0_0_8px_#2ECC71]' : 'bg-[#E74C3C] shadow-[0_0_8px_#E74C3C]'}`}></div>
          </div>
          
          <div className="h-8 w-[1px] bg-[#2D3139]"></div>
          
          <div className="flex gap-2">
            {!modbusState.isConnected ? (
              <button 
                onClick={handleConnect}
                className="flex items-center gap-2 rounded bg-[#3498DB] px-4 py-2 text-xs font-bold text-white hover:bg-[#2980b9] transition-colors cursor-pointer"
              >
                <Usb className="h-4 w-4" />
                CONNECT DRIVE
              </button>
            ) : (
              <button 
                onClick={handleDisconnect}
                className="flex items-center gap-2 rounded bg-[#34495E] px-4 py-2 text-xs font-bold text-white hover:bg-[#2C3E50] transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                DISCONNECT
              </button>
            )}
            
            <button 
              onClick={onLogout}
              className="flex items-center justify-center rounded bg-[#E74C3C] px-3 py-2 text-xs font-bold text-white hover:bg-[#C0392B] transition-colors cursor-pointer"
              title="Logout / تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="m-6 mb-0 rounded border border-[#E74C3C] bg-[#E74C3C]/10 p-4 text-[#E74C3C] flex items-center gap-3">
          <AlertOctagon className="h-5 w-5" />
          <span className="text-sm font-semibold">{errorMsg}</span>
        </div>
      )}

      {/* Main Grid Layout */}
      <main className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-6 p-6 overflow-y-auto">
        
        {/* LEFT COLUMN: Operations & Status Monitors (8 cols on XL) */}
        <section className="xl:col-span-7 flex flex-col gap-6">
          
          {/* Main Control Panel */}
          <div className="flex flex-col rounded-xl border border-[#2D3139] bg-[#161920] p-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between border-b border-[#2D3139] pb-4">
              <div className="flex items-center gap-3">
                <Activity className="h-6 w-6 text-[#2ECC71]" />
                <h2 className="text-xl font-bold">Operation Panel / لوحة تشغيل السيرفو</h2>
              </div>
              <span className="font-mono text-[12px] text-[#8E9299]" dir="ltr">Virtual Register: P09-26 (VDI1)</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-4">
              {/* START BUTTON */}
              <button 
                onClick={triggerStartCycle}
                disabled={!modbusState.isConnected}
                className="group flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-[#2ECC71] bg-[#1E2521] py-10 transition-colors hover:bg-[#2ECC71] hover:text-[#0F1115] disabled:opacity-30 disabled:hover:bg-[#1E2521] disabled:hover:text-inherit cursor-pointer"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#2ECC71] group-hover:border-[#0F1115] group-disabled:group-hover:border-[#2ECC71] transition-colors">
                  <div className="ml-2 h-0 w-0 border-y-[12px] border-l-[20px] border-y-transparent border-l-current"></div>
                </div>
                <div className="text-center">
                  <span className="block text-2xl font-black uppercase tracking-wider" dir="ltr">Start Cycle</span>
                  <span className="text-sm opacity-80">بدء دورة حركة الآلة</span>
                </div>
              </button>
              
              {/* EMERGENCY STOP BUTTON */}
              <button 
                onClick={triggerEmergencyStop}
                disabled={!modbusState.isConnected}
                className="group flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-[#E74C3C] bg-[#251E1E] py-10 transition-colors hover:bg-[#E74C3C] hover:text-[#0F1115] disabled:opacity-30 disabled:hover:bg-[#251E1E] disabled:hover:text-inherit cursor-pointer"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#E74C3C] group-hover:border-[#0F1115] group-disabled:group-hover:border-[#E74C3C] transition-colors">
                  <div className="h-10 w-10 rounded-sm bg-current"></div>
                </div>
                <div className="text-center">
                  <span className="block text-2xl font-black uppercase tracking-wider" dir="ltr">Emergency Stop</span>
                  <span className="text-sm opacity-80">توقف طوارئ فوري</span>
                </div>
              </button>
            </div>
          </div>

          {/* TELEMETRY GAUGES */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Speed Gauge */}
            <div className="rounded-xl border border-[#2D3139] bg-[#161920] p-4 flex flex-col justify-between">
              <div className="flex justify-between items-center text-[#8E9299]">
                <span className="text-xs font-bold uppercase tracking-widest">Motor Speed / السرعة</span>
                <Gauge className="h-4 w-4 text-[#3498DB]" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-mono font-bold text-[#3498DB]">{currentSpeed}</span>
                <span className="text-sm text-gray-500">RPM</span>
              </div>
              <span className="text-[10px] text-[#5D6D7E] mt-2">قيمة مستمرة من P13-02</span>
            </div>

            {/* DC Bus Voltage Gauge */}
            <div className="rounded-xl border border-[#2D3139] bg-[#161920] p-4 flex flex-col justify-between">
              <div className="flex justify-between items-center text-[#8E9299]">
                <span className="text-xs font-bold uppercase tracking-widest">DC Bus Voltage / جهد الباص</span>
                <Cpu className="h-4 w-4 text-[#2ECC71]" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-4xl font-mono font-bold text-[#2ECC71]">{busVoltage}</span>
                <span className="text-sm text-gray-500">V</span>
              </div>
              <span className="text-[10px] text-[#5D6D7E] mt-2">قيمة مستمرة من P13-15</span>
            </div>

            {/* Modbus Error Status */}
            <div className="rounded-xl border border-[#2D3139] bg-[#161920] p-4 flex flex-col justify-between">
              <div className="flex justify-between items-center text-[#8E9299]">
                <span className="text-xs font-bold uppercase tracking-widest">Drive Status / الحالة</span>
                <AlertOctagon className="h-4 w-4 text-[#F39C12]" />
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className={`text-2xl font-mono font-bold ${lastErrorCode === 0 ? 'text-[#2ECC71]' : 'text-[#E74C3C]'}`}>
                  {lastErrorCode === 0 ? 'READY' : `ERROR ${lastErrorCode}`}
                </span>
              </div>
              <span className="text-[10px] text-[#5D6D7E] mt-2">تفاصيل الخطأ من P09-03</span>
            </div>
          </div>

          {/* REAL-TIME TORQUE MONITOR CHART */}
          <div className="flex h-52 flex-col rounded-xl border border-[#2D3139] bg-[#161920] p-6">
            <div className="mb-4 flex justify-between" dir="ltr">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#8E9299]">Real-time Torque Monitor (P13-21)</h3>
              <span className="font-mono text-sm text-[#F39C12] font-semibold">Current Torque: {currentTorque}%</span>
            </div>
            <div className="flex flex-1 items-end gap-1 px-2 border-b border-[#2D3139]" dir="ltr">
              {torqueHistory.map((val, i) => {
                const boundedHeight = Math.max(5, Math.min(100, val));
                let colorClass = "bg-[#2D3139]";
                if (boundedHeight > 80) colorClass = "bg-[#E74C3C]";
                else if (boundedHeight > 50) colorClass = "bg-[#F39C12]";
                else if (boundedHeight > 20) colorClass = "bg-[#3498DB]";
                return (
                  <div 
                    key={i} 
                    className={`flex-1 transition-all duration-150 rounded-t-sm ${colorClass}`} 
                    style={{ height: `${boundedHeight}%` }}
                    title={`Torque: ${val}%`}
                  ></div>
                );
              })}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Advanced Programming & Configuration Profiles (5 cols on XL) */}
        <section className="xl:col-span-5 flex flex-col gap-6">
          
          {/* Main Control Panel for Admins / Developers */}
          <div className="flex flex-col rounded-xl border border-[#34495E] bg-[#1C1F26] p-6 shadow-xl">
            <div className="mb-6 flex items-center gap-3 border-b border-[#34495E] pb-4">
              <Settings2 className="h-6 w-6 text-[#3498DB]" />
              <h2 className="text-lg font-bold">Programming Console / برمجـة ومعايـرة السيرفو</h2>
            </div>

            {/* Quick Calibration parameters */}
            <div className="space-y-6">
              {/* TORQUE LIMIT */}
              <div className="rounded-lg border border-[#2D3139] bg-[#161920] p-4">
                <label className="mb-2 block text-xs uppercase text-[#8E9299] font-medium">Forward Torque Limit / عزم الدوران الأمامي (P03-13)</label>
                <div className="flex items-center gap-4" dir="ltr">
                  <input 
                    type="text"
                    value={torqueLimit}
                    onChange={e => setTorqueLimit(e.target.value)}
                    className="w-24 rounded border border-[#34495E] bg-[#0F1115] px-4 py-2 font-mono text-xl text-[#3498DB] focus:border-[#3498DB] focus:outline-none"
                    disabled={role !== 'Admin'}
                  />
                  <span className="text-lg font-semibold">%</span>
                  <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-[#0F1115]">
                    <div 
                      className="h-full bg-[#3498DB] transition-all" 
                      style={{ width: `${Math.min(100, parseInt(torqueLimit) || 0)}%` }}
                    ></div>
                  </div>
                  {role === 'Admin' && (
                    <button 
                      onClick={applyTorqueLimit}
                      disabled={!modbusState.isConnected}
                      className="rounded bg-[#F39C12] p-2 text-[#0F1115] hover:bg-[#d35400] transition-colors disabled:opacity-40 cursor-pointer"
                      title="Write to Drive RAM"
                    >
                      <Save className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[10px] italic text-[#5D6D7E]">سيتم تحديث البارامتر وحفظه في ذاكرة RAM فقط لحماية الـ EEPROM</p>
              </div>

              {/* DWELL TIME */}
              <div className="rounded-lg border border-[#2D3139] bg-[#161920] p-4">
                <label className="mb-2 block text-xs uppercase text-[#8E9299] font-medium">Dwell Time / زمن الانتظار الميكانيكي</label>
                <div className="flex items-center gap-4" dir="ltr">
                  <input 
                    type="text"
                    value={dwellTime}
                    onChange={e => setDwellTime(e.target.value)}
                    className="w-24 rounded border border-[#34495E] bg-[#0F1115] px-4 py-2 font-mono text-xl text-[#2ECC71] focus:border-[#2ECC71] focus:outline-none"
                    disabled={role !== 'Admin'}
                  />
                  <span className="text-lg font-semibold">sec</span>
                  <div className="flex flex-1 gap-1">
                    <div className="h-2 flex-1 bg-[#2ECC71]"></div>
                    <div className="h-2 flex-1 bg-[#2ECC71]"></div>
                    <div className="h-2 flex-1 bg-[#2ECC71]"></div>
                    <div className="h-2 flex-1 bg-[#2D3139]"></div>
                  </div>
                </div>
              </div>

              {/* ARBITRARY REGISTER PROGRAMMER */}
              <div className="rounded-lg border border-[#2D3139] bg-[#161920] p-4">
                <div className="mb-3 flex items-center justify-between border-b border-[#2D3139] pb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-white">General Register Tool / برمجة السجلات العامة</label>
                  <span className="font-mono text-[10px] text-[#F39C12]">Function: 0x03 & 0x06</span>
                </div>
                <div className="space-y-4" dir="ltr">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className="block text-[10px] text-[#8E9299] uppercase mb-1">Group (مجموعة)</span>
                      <input 
                        type="text" 
                        value={customGroup}
                        onChange={e => setCustomGroup(e.target.value)}
                        placeholder="05" 
                        className="w-full text-center rounded border border-[#34495E] bg-[#0F1115] py-2 font-mono text-sm text-[#3498DB] focus:outline-none"
                        disabled={role !== 'Admin'}
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#8E9299] uppercase mb-1">Parameter (رقم)</span>
                      <input 
                        type="text" 
                        value={customParam}
                        onChange={e => setCustomParam(e.target.value)}
                        placeholder="16" 
                        className="w-full text-center rounded border border-[#34495E] bg-[#0F1115] py-2 font-mono text-sm text-[#3498DB] focus:outline-none"
                        disabled={role !== 'Admin'}
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#8E9299] uppercase mb-1">Value (القيمة)</span>
                      <input 
                        type="text" 
                        value={customValue}
                        onChange={e => setCustomValue(e.target.value)}
                        placeholder="1296" 
                        className="w-full text-center rounded border border-[#34495E] bg-[#0F1115] py-2 font-mono text-sm text-[#2ECC71] focus:outline-none"
                        disabled={role !== 'Admin'}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="ram_toggle" 
                      checked={writeToRam}
                      onChange={e => setWriteToRam(e.target.checked)}
                      className="rounded border-[#34495E] bg-[#0F1115] text-[#3498DB] focus:ring-0 cursor-pointer"
                      disabled={role !== 'Admin'}
                    />
                    <label htmlFor="ram_toggle" className="text-[11px] text-[#8E9299] cursor-pointer">
                      الكتابة المؤقتة في الـ RAM فقط لحماية الـ EEPROM (+0x8000)
                    </label>
                  </div>

                  {role === 'Admin' && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <button 
                        onClick={handleCustomRead}
                        disabled={!modbusState.isConnected}
                        className="rounded bg-[#34495E] py-2 text-xs font-bold text-white hover:bg-[#2C3E50] transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        PULL/READ (سحب القيمة)
                      </button>
                      <button 
                        onClick={handleCustomWrite}
                        disabled={!modbusState.isConnected}
                        className="rounded bg-[#2ECC71] py-2 text-xs font-bold text-[#0F1115] hover:bg-[#27ae60] transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        WRITE/PROGRAM (برمجة)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* DRIVE QUICK MACROS / PRESETS */}
              {role === 'Admin' && (
                <div className="rounded-lg border border-[#2D3139] bg-[#161920] p-4">
                  <div className="mb-3 flex items-center justify-between border-b border-[#2D3139] pb-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-white">Preset Command Macros / وحدات برمجة سريعة</label>
                    <BookOpen className="h-4 w-4 text-[#F39C12]" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" dir="ltr">
                    <button 
                      onClick={() => runPresetMacro("Set Speed to 1000 RPM", 4, 1, 1000, true)}
                      disabled={!modbusState.isConnected}
                      className="text-left px-3 py-2 rounded bg-[#0F1115] border border-[#2D3139] hover:border-[#3498DB] text-[11px] font-mono text-[#3498DB] hover:bg-[#3498DB]/10 transition-all disabled:opacity-40 cursor-pointer"
                    >
                      ⚡ Set Speed: 1000 RPM (P04-01)
                    </button>
                    <button 
                      onClick={() => runPresetMacro("Set Speed to 3000 RPM", 4, 1, 3000, true)}
                      disabled={!modbusState.isConnected}
                      className="text-left px-3 py-2 rounded bg-[#0F1115] border border-[#2D3139] hover:border-[#3498DB] text-[11px] font-mono text-[#3498DB] hover:bg-[#3498DB]/10 transition-all disabled:opacity-40 cursor-pointer"
                    >
                      ⚡ Set Speed: 3000 RPM (P04-01)
                    </button>
                    <button 
                      onClick={() => runPresetMacro("Set Pulse Format (P05-16)", 5, 16, 1, false)}
                      disabled={!modbusState.isConnected}
                      className="text-left px-3 py-2 rounded bg-[#0F1115] border border-[#2D3139] hover:border-[#2ECC71] text-[11px] font-mono text-[#2ECC71] hover:bg-[#2ECC71]/10 transition-all disabled:opacity-40 cursor-pointer"
                    >
                      ⚡ Pulse Mode: Pul/Dir (P05-16)
                    </button>
                    <button 
                      onClick={() => runPresetMacro("Clear Error Register", 9, 3, 0, true)}
                      disabled={!modbusState.isConnected}
                      className="text-left px-3 py-2 rounded bg-[#0F1115] border border-[#2D3139] hover:border-[#E74C3C] text-[11px] font-mono text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-all disabled:opacity-40 cursor-pointer"
                    >
                      ⚡ Clear Modbus Fault (P09-03)
                    </button>
                  </div>
                </div>
              )}

              {/* ACTION / DIAGNOSTICS LOG */}
              <div className="rounded-lg border border-[#2D3139] bg-[#0F1115] p-4 flex flex-col h-44">
                <div className="mb-2 flex items-center justify-between border-b border-[#2D3139] pb-1 text-[#8E9299]">
                  <span className="text-[10px] font-bold uppercase tracking-wider">Modbus Communication Console / سجل الاتصالات</span>
                  <Terminal className="h-4 w-4" />
                </div>
                <div className="flex-1 overflow-y-auto font-mono text-[10px] text-[#2ECC71] space-y-1 scrollbar-thin scrollbar-thumb-gray-800" dir="ltr">
                  {communicationLog.length === 0 ? (
                    <span className="text-gray-500 italic">No communication logs recorded yet.</span>
                  ) : (
                    communicationLog.map((log, index) => (
                      <div key={index} className="leading-relaxed border-b border-[#161920] pb-1">{log}</div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="flex h-10 items-center justify-between border-t border-[#2D3139] bg-[#0F1115] px-8 font-mono text-[10px] text-[#5D6D7E]" dir="ltr">
        <div className="flex gap-6">
          <span>SLAVE ID: {SLAVE_ID.toString().padStart(2, '0')}</span>
          <span>PROTOCOL: Modbus RTU (8-N-1)</span>
          <span>PORT: Web Serial API</span>
        </div>
        <div className="flex items-center gap-2">
          {modbusState.isConnected ? (
             <span className="h-2 w-2 animate-pulse rounded-full bg-[#2ECC71]"></span>
          ) : (
             <span className="h-2 w-2 rounded-full bg-[#E74C3C]"></span>
          )}
          <span>{modbusState.isConnected ? 'TX/RX ACTIVE' : 'DISCONNECTED'}</span>
          <span className="ml-4">SAMKOON AUTOMATION CO.</span>
        </div>
      </footer>
    </div>
  );
}
