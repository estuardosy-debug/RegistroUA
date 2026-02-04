import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  Calendar,
  FileText,
  CheckCircle,
  LogOut,
  Settings,
  Search,
  Bell,
  Menu,
  X,
  ChevronDown,
  Copy,
  Download,
  UserPlus,
  Shield,
  Gavel,
  LayoutDashboard,
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  onSnapshot,
  orderBy,
  doc,
  updateDoc,
  setDoc,
  getDoc,
  serverTimestamp,
  deleteDoc,
  where,
} from "firebase/firestore";

// --- CONFIGURACIÓN DE FIREBASE ---
// IMPORTANTE: En CodeSandbox, asegura que esta línea tenga TUS credenciales reales.
// Si estás copiando esto de nuevo a CodeSandbox, recuerda borrar la línea de abajo
// y pegar tu bloque 'const firebaseConfig = { ... }' real.
const firebaseConfig = {
  apiKey: "AIzaSyCev8t_5QrMRaUdj7asULIcQPm25FaWHKw",
  authDomain: "registro-ua.firebaseapp.com",
  projectId: "registro-ua",
  storageBucket: "registro-ua.firebasestorage.app",
  messagingSenderId: "32518463118",
  appId: "1:32518463118:web:cde63be93d4ca07623f3df",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== "undefined" ? __app_id : "juzgado-app";

// --- UTILIDADES ---
const formatDateTime = (date) => {
  if (!date) return "";
  return new Date(date.seconds * 1000).toLocaleString("es-GT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const exportToCSV = (data, filename) => {
  if (!data.length) return;

  const headers = [
    "ID Registro",
    "Fecha y Hora",
    "Nombres Completos",
    "Teléfono",
    "Email",
    "Causa (Juzgado-Año-Proceso)",
    "Sujeto Procesal",
    "Fiscalía",
    "Casillero Electrónico",
  ];

  const rows = data.map((item) => [
    item.id,
    item.createdAt ? formatDateTime(item.createdAt) : "",
    `"${item.fullName}"`,
    item.phone,
    item.email,
    item.causaFull,
    item.subject,
    item.fiscalia || "N/A",
    item.locker || "N/A",
  ]);

  const csvContent =
    "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// --- COMPONENTES ---

// 1. Pantalla de Bienvenida y Registro Público
const PublicRegistration = ({ onViewChange, isConnected }) => {
  const [step, setStep] = useState("welcome");
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    causaCode: "C-01",
    causaYear: new Date().getFullYear().toString(),
    causaNumber: "",
    subject: "",
    subjectCustom: "",
    fiscalia: "",
    locker: "",
  });
  const [subjectsList, setSubjectsList] = useState([
    "SINDICADO",
    "DEFENSA TÉCNICA",
    "AGRAVIADO",
    "QUERELLANTE ADHESIVO",
    "AUXILIAR FISCAL",
    "AGENTE FISCAL",
    "SOLICITANTE",
  ]);
  const [loading, setLoading] = useState(false);

  // Cargar lista dinámica (settings)
  useEffect(() => {
    if (!isConnected) return;

    const settingsRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "settings",
      "global"
    );

    const unsub = onSnapshot(
      settingsRef,
      (docSnap) => {
        if (docSnap.exists() && docSnap.data().subjects) {
          setSubjectsList(docSnap.data().subjects);
        }
      },
      (error) => {
        console.log(
          "Info: Configuración personalizada no encontrada, usando defaults."
        );
      }
    );

    return () => unsub();
  }, [isConnected]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const shouldUpper = [
      "fullName",
      "subjectCustom",
      "fiscalia",
      "locker",
      "causaCode",
    ].includes(name);
    setFormData((prev) => ({
      ...prev,
      [name]: shouldUpper ? value.toUpperCase() : value,
    }));
  };

  const isFormValid = () => {
    const basicValid =
      formData.fullName &&
      formData.phone &&
      formData.email &&
      formData.causaYear &&
      formData.causaNumber &&
      formData.subject;

    if (!basicValid) return false;
    if (formData.subject === "PERSONALIZAR" && !formData.subjectCustom)
      return false;
    if (
      ["AUXILIAR FISCAL", "AGENTE FISCAL"].includes(formData.subject) &&
      !formData.fiscalia
    )
      return false;
    if (
      ["DEFENSA TÉCNICA", "AUXILIAR FISCAL", "AGENTE FISCAL"].includes(
        formData.subject
      ) &&
      !formData.locker
    )
      return false;

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid() || !isConnected) {
      if (!isConnected)
        alert("Conectando con el servidor... Intente en un momento.");
      return;
    }
    setLoading(true);

    try {
      let finalSubject = formData.subject;

      if (formData.subject === "PERSONALIZAR") {
        finalSubject = formData.subjectCustom;
        if (!subjectsList.includes(finalSubject)) {
          const newSubjects = [...subjectsList, finalSubject].sort();
          await setDoc(
            doc(db, "artifacts", appId, "public", "data", "settings", "global"),
            { subjects: newSubjects },
            { merge: true }
          );
        }
      }

      const causaFull = `[${formData.causaCode || "X"}] - [${
        formData.causaYear
      }] - [${formData.causaNumber}]`;

      await addDoc(
        collection(db, "artifacts", appId, "public", "data", "registrations"),
        {
          ...formData,
          subject: finalSubject,
          causaFull,
          createdAt: serverTimestamp(),
          status: "active",
        }
      );

      setStep("success");
    } catch (error) {
      console.error("Error al registrar:", error);
      alert("Hubo un error al guardar su registro. Verifique su conexión.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "welcome") {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white max-w-2xl w-full rounded-2xl shadow-xl overflow-hidden">
          <div className="h-3 bg-[#00A8E8]"></div>
          <div className="p-8 md:p-12 text-center">
            <div className="flex justify-center mb-6">
              <div className="bg-blue-50 p-4 rounded-full">
                <Gavel className="w-12 h-12 text-[#00A8E8]" />
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-4 font-sans">
              Juzgado Primero de Primera Instancia Penal y de Narcoactividad
            </h1>
            <h2 className="text-lg text-slate-600 font-medium mb-8">
              Departamento de Alta Verapaz
            </h2>
            <div className="bg-blue-50 border border-blue-100 p-6 rounded-xl mb-8">
              <p className="text-slate-700 text-lg leading-relaxed">
                "Si usted ha sido convocado para participar en una audiencia
                oral, por favor inicie con el registro de sus datos, necesarios
                para su debida identificación actualizada y posteriores
                comunicaciones."
              </p>
            </div>
            <button
              onClick={() => setStep("form")}
              className="w-full md:w-auto bg-[#00A8E8] hover:bg-blue-600 text-white font-bold py-4 px-10 rounded-full text-xl transition-all shadow-lg hover:shadow-blue-200 transform hover:-translate-y-1"
            >
              Inicie registro
            </button>
            <div className="mt-8 text-sm text-slate-400">
              <button
                onClick={() => onViewChange("login")}
                className="hover:text-[#00A8E8] underline"
              >
                Acceso Administrativo
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white max-w-lg w-full rounded-2xl shadow-xl overflow-hidden p-8 text-center animate-fade-in">
          <div className="flex justify-center mb-6">
            <CheckCircle className="w-20 h-20 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">
            ¡Registro Exitoso!
          </h2>
          <p className="text-slate-600 text-lg mb-8">
            Su información ha sido enviada para el registro correspondiente.
            Espere que se autorice su acceso a la Sala de Audiencias. Gracias.
          </p>
          <button
            onClick={() => {
              setFormData({
                fullName: "",
                phone: "",
                email: "",
                causaCode: "C-01",
                causaYear: new Date().getFullYear().toString(),
                causaNumber: "",
                subject: "",
                subjectCustom: "",
                fiscalia: "",
                locker: "",
              });
              setStep("welcome");
            }}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-lg transition-colors"
          >
            Volver al Inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 flex justify-center items-start">
      <div className="bg-white max-w-3xl w-full rounded-2xl shadow-xl overflow-hidden">
        <div className="h-2 bg-[#00A8E8]"></div>
        <div className="p-6 md:p-8">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold text-slate-800">
              Formulario de Registro
            </h2>
            <button
              onClick={() => setStep("welcome")}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Datos Personales */}
            <div className="grid md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nombres y Apellidos Completos *
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-[#00A8E8] focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  placeholder="Ingrese su nombre completo"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Teléfono *
                </label>
                <input
                  type="number"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-[#00A8E8] focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  placeholder="Número telefónico"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-[#00A8E8] focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  placeholder="ejemplo@correo.com"
                />
              </div>
            </div>

            {/* Causa */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Número de Causa *
              </label>
              <div className="flex items-center space-x-2">
                <div className="w-1/4">
                  <input
                    type="text"
                    name="causaCode"
                    value={formData.causaCode}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-center rounded border border-slate-300 font-mono"
                    placeholder="C-01"
                  />
                  <p className="text-xs text-center text-slate-400 mt-1">
                    Código
                  </p>
                </div>
                <span className="text-slate-400 font-bold">-</span>
                <div className="w-1/4">
                  <input
                    type="number"
                    name="causaYear"
                    value={formData.causaYear}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 text-center rounded border border-slate-300 font-mono"
                    placeholder="2024"
                  />
                  <p className="text-xs text-center text-slate-400 mt-1">Año</p>
                </div>
                <span className="text-slate-400 font-bold">-</span>
                <div className="flex-1">
                  <input
                    type="number"
                    name="causaNumber"
                    value={formData.causaNumber}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 rounded border border-slate-300 font-mono"
                    placeholder="00123"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Número de Proceso
                  </p>
                </div>
              </div>
            </div>

            {/* Sujeto Procesal */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Sujeto Procesal *
              </label>
              <select
                name="subject"
                value={formData.subject}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-[#00A8E8] focus:ring-2 focus:ring-blue-100 outline-none bg-white"
              >
                <option value="">Seleccione una opción...</option>
                {subjectsList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value="PERSONALIZAR">OTRO (PERSONALIZAR)</option>
              </select>
            </div>

            {/* Campos Condicionales */}
            {formData.subject === "PERSONALIZAR" && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                <label className="block text-sm font-semibold text-[#00A8E8] mb-2">
                  Especifique el Sujeto Procesal *
                </label>
                <input
                  type="text"
                  name="subjectCustom"
                  value={formData.subjectCustom}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-[#00A8E8] focus:ring-2 focus:ring-blue-100 outline-none"
                  placeholder="INGRESE EL ROL..."
                />
              </div>
            )}

            {(formData.subject === "AUXILIAR FISCAL" ||
              formData.subject === "AGENTE FISCAL") && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Identifique la Fiscalía *
                </label>
                <input
                  type="text"
                  name="fiscalia"
                  value={formData.fiscalia}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-[#00A8E8] focus:ring-2 focus:ring-blue-100 outline-none"
                  placeholder="EJ: FISCALÍA DE LA MUJER..."
                />
              </div>
            )}

            {["DEFENSA TÉCNICA", "AUXILIAR FISCAL", "AGENTE FISCAL"].includes(
              formData.subject
            ) && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Casillero Electrónico *
                </label>
                <input
                  type="text"
                  name="locker"
                  value={formData.locker}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-[#00A8E8] focus:ring-2 focus:ring-blue-100 outline-none"
                  placeholder="EJ: ABOGADO123"
                />
              </div>
            )}

            <div className="pt-4">
              <button
                type="submit"
                disabled={!isFormValid() || loading}
                className={`w-full py-4 rounded-lg font-bold text-lg transition-all shadow-lg ${
                  isFormValid() && !loading
                    ? "bg-[#00A8E8] hover:bg-blue-600 text-white transform hover:-translate-y-1"
                    : "bg-slate-300 text-slate-500 cursor-not-allowed"
                }`}
              >
                {loading ? "Enviando..." : "ENVIAR REGISTRO"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// 2. Login y Registro de Funcionarios (Soft Auth Implementation)
const AuthScreen = ({ onViewChange, onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const handleAuth = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);

    try {
      if (isLogin) {
        // --- ADMIN LOGIN (Hardcoded Bypass) ---
        if (
          email.trim() === "admin@juzgado.gob.gt" &&
          password === "Admin2024!"
        ) {
          onLogin({ role: "admin", name: "Administrador", uid: "admin-sys" });
          return;
        }

        // --- AUXILIAR LOGIN (Database Lookup) ---
        // Consultar el directorio público
        const q = query(
          collection(db, "artifacts", appId, "public", "data", "directory"),
          where("email", "==", email),
          where("password", "==", password) // NOTA: Solo para DEMO en este entorno restringido
        );

        // Simular delay de red
        await new Promise((r) => setTimeout(r, 800));

        // No podemos usar getDocs por restricciones de importación async en algunas configs, usamos snapshot one-off
        // Pero onSnapshot es mejor.
        // Simulamos un fetch manual rápido
        const checkLogin = new Promise((resolve, reject) => {
          const unsub = onSnapshot(
            q,
            (snapshot) => {
              unsub();
              if (snapshot.empty) {
                reject("Credenciales inválidas.");
              } else {
                const userData = snapshot.docs[0].data();
                resolve({ ...userData, id: snapshot.docs[0].id });
              }
            },
            reject
          );
        });

        const userData = await checkLogin;

        if (userData.status === "pending") {
          setError("Su cuenta está pendiente de aprobación.");
          setLoading(false);
          return;
        }

        onLogin(userData);
      } else {
        // --- REGISTRO AUXILIAR (Soft Create) ---
        // Guardamos en directorio público
        await addDoc(
          collection(db, "artifacts", appId, "public", "data", "directory"),
          {
            name: name,
            email: email,
            password: password, // Solo para Demo
            role: "auxiliar",
            status: "pending",
            createdAt: serverTimestamp(),
          }
        );

        setSuccessMsg("Solicitud enviada. Espere aprobación.");
        setIsLogin(true);
      }
    } catch (err) {
      console.error(err);
      setError(typeof err === "string" ? err : "Error de autenticación.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="h-2 bg-[#00A8E8]"></div>
        <div className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-slate-800">
              {isLogin ? "Acceso al Sistema" : "Solicitud de Acceso"}
            </h2>
            <p className="text-slate-500 mt-2">
              {isLogin
                ? "Ingrese sus credenciales institucionales"
                : "Registro para Auxiliares Judiciales"}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm font-medium">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 text-sm font-medium">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-5">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre Completo
                </label>
                <div className="relative">
                  <Users className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:border-[#00A8E8] focus:ring-1 focus:ring-blue-100 outline-none"
                    placeholder="Juan Pérez"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Usuario / Email
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:border-[#00A8E8] focus:ring-1 focus:ring-blue-100 outline-none"
                  placeholder="usuario@dominio.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Contraseña
              </label>
              <div className="relative">
                <Shield className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:border-[#00A8E8] focus:ring-1 focus:ring-blue-100 outline-none"
                  placeholder={isLogin ? "••••••••" : "Cree una contraseña"}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00A8E8] hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition-colors shadow-md"
            >
              {loading
                ? "Procesando..."
                : isLogin
                ? "Iniciar Sesión"
                : "Enviar Solicitud"}
            </button>
          </form>

          <div className="mt-6 text-center pt-6 border-t border-slate-100">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
                setSuccessMsg("");
              }}
              className="text-sm text-[#00A8E8] font-medium hover:underline"
            >
              {isLogin
                ? "¿No tiene cuenta? Solicitar acceso como Auxiliar"
                : "¿Ya tiene cuenta? Iniciar Sesión"}
            </button>
            <div className="mt-4">
              <button
                onClick={() => onViewChange("welcome")}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                ← Volver al Kiosco Público
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 3. Dashboard Administrativo
const Dashboard = ({ user, onLogout }) => {
  const [registrations, setRegistrations] = useState([]);
  const [filterDate, setFilterDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [currentView, setCurrentView] = useState("registros");
  const [pendingUsers, setPendingUsers] = useState([]);
  const [copiedGroup, setCopiedGroup] = useState(null);

  // Escuchar registros
  useEffect(() => {
    // Ruta corregida: artifacts/{appId}/public/data/registrations
    const q = query(
      collection(db, "artifacts", appId, "public", "data", "registrations"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setRegistrations(docs);
      },
      (error) => {
        console.error("Error cargando registros:", error);
      }
    );
    return () => unsubscribe();
  }, []);

  // Escuchar usuarios (Ahora de 'public/data/directory')
  useEffect(() => {
    if (user.role !== "admin") return;
    const q = query(
      collection(db, "artifacts", appId, "public", "data", "directory")
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const users = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPendingUsers(users);
      },
      (error) => {
        console.error("Error cargando directorio de usuarios:", error);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // Agrupar registros
  const groupedRegistrations = useMemo(() => {
    const filtered = registrations.filter((r) => {
      if (!r.createdAt) return false;
      const regDate = new Date(r.createdAt.seconds * 1000)
        .toISOString()
        .split("T")[0];
      return regDate === filterDate;
    });

    const groups = {};
    filtered.forEach((reg) => {
      if (!groups[reg.causaFull]) groups[reg.causaFull] = [];
      groups[reg.causaFull].push(reg);
    });
    return groups;
  }, [registrations, filterDate]);

  const copyEmails = (emails, groupId) => {
    const emailString = emails.join("; ");
    navigator.clipboard.writeText(emailString);
    setCopiedGroup(groupId);
    setTimeout(() => setCopiedGroup(null), 2000);
  };

  const handleUserAction = async (userId, action) => {
    try {
      if (action === "approve") {
        await updateDoc(
          doc(db, "artifacts", appId, "public", "data", "directory", userId),
          { status: "active" }
        );
      } else if (action === "delete") {
        await deleteDoc(
          doc(db, "artifacts", appId, "public", "data", "directory", userId)
        );
      }
    } catch (err) {
      console.error(err);
      alert("Error al gestionar usuario");
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex-shrink-0 hidden md:flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center space-x-3 mb-1">
            <div className="w-8 h-8 bg-[#00A8E8] rounded-lg flex items-center justify-center">
              <Gavel className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-wide">Juzgado 1°</span>
          </div>
          <span className="text-xs text-slate-400 uppercase tracking-widest">
            Gestión de Audiencias
          </span>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1">
          <button
            onClick={() => setCurrentView("registros")}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              currentView === "registros"
                ? "bg-[#00A8E8] text-white shadow-lg shadow-blue-900/50"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium">Dashboard</span>
          </button>

          {user.role === "admin" && (
            <button
              onClick={() => setCurrentView("usuarios")}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
                currentView === "usuarios"
                  ? "bg-[#00A8E8] text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">Usuarios</span>
            </button>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center space-x-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">
              {user.name ? user.name.charAt(0) : "U"}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs text-slate-400 capitalize">{user.role}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-red-600/20 hover:text-red-400 text-slate-400 py-2 rounded-lg transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header Movil y PC */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 md:px-8">
          <div className="md:hidden flex items-center">
            <Menu className="w-6 h-6 text-slate-600" />
          </div>

          <div className="flex-1 px-4 md:px-0">
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">
              {currentView === "registros"
                ? "Audiencias del Día"
                : "Gestión de Personal"}
            </h1>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden md:flex bg-slate-100 rounded-full px-4 py-2 items-center text-slate-500 text-sm">
              <Calendar className="w-4 h-4 mr-2" />
              {new Date().toLocaleDateString("es-GT", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 md:p-8 bg-[#F5F7FB]">
          {currentView === "registros" && (
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Stats & Filters Card */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center space-x-4 w-full md:w-auto">
                  <div className="bg-blue-50 p-3 rounded-xl">
                    <FileText className="w-6 h-6 text-[#00A8E8]" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Total Registros</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {Object.values(groupedRegistrations).flat().length}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:border-[#00A8E8]"
                  />
                  <button
                    onClick={() =>
                      setFilterDate(new Date().toISOString().split("T")[0])
                    }
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-medium text-sm transition-colors"
                  >
                    Hoy
                  </button>
                  <button
                    onClick={() =>
                      exportToCSV(
                        registrations,
                        `Registros_Completo_${
                          new Date().toISOString().split("T")[0]
                        }.csv`
                      )
                    }
                    className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm transition-colors"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Exportar Excel
                  </button>
                </div>
              </div>

              {/* Lista de Registros */}
              <div className="space-y-6">
                {Object.keys(groupedRegistrations).length === 0 ? (
                  <div className="text-center py-12">
                    <div className="bg-slate-100 inline-flex p-4 rounded-full mb-4">
                      <Search className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-600">
                      No hay registros para esta fecha
                    </h3>
                    <p className="text-slate-400">
                      Intente cambiar el filtro de fecha.
                    </p>
                  </div>
                ) : (
                  Object.entries(groupedRegistrations).map(([causa, items]) => (
                    <div
                      key={causa}
                      className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-2"
                    >
                      <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                        <div>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                            Causa
                          </p>
                          <h3 className="text-lg font-bold text-slate-800 font-mono">
                            {causa}
                          </h3>
                        </div>
                        <button
                          onClick={() =>
                            copyEmails(
                              items.map((i) => i.email),
                              causa
                            )
                          }
                          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            copiedGroup === causa
                              ? "bg-green-100 text-green-700"
                              : "bg-blue-50 text-[#00A8E8] hover:bg-blue-100"
                          }`}
                        >
                          {copiedGroup === causa ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                          <span>
                            {copiedGroup === causa
                              ? "Copiado"
                              : "Copiar Emails"}
                          </span>
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-white text-slate-500 text-xs uppercase font-semibold">
                            <tr>
                              <th className="px-6 py-3">Nombre</th>
                              <th className="px-6 py-3">Rol</th>
                              <th className="px-6 py-3">Contacto</th>
                              <th className="px-6 py-3">Detalles</th>
                              <th className="px-6 py-3">Hora</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 text-sm text-slate-600">
                            {items.map((item) => (
                              <tr
                                key={item.id}
                                className="hover:bg-slate-50 transition-colors"
                              >
                                <td className="px-6 py-4 font-medium text-slate-800">
                                  {item.fullName}
                                </td>
                                <td className="px-6 py-4">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                    {item.subject}
                                  </span>
                                </td>
                                <td className="px-6 py-4 space-y-1">
                                  <div className="flex items-center text-xs">
                                    <span className="w-16 text-slate-400">
                                      Tel:
                                    </span>{" "}
                                    {item.phone}
                                  </div>
                                  <div className="flex items-center text-xs">
                                    <span className="w-16 text-slate-400">
                                      Email:
                                    </span>{" "}
                                    {item.email}
                                  </div>
                                </td>
                                <td className="px-6 py-4 space-y-1">
                                  {item.fiscalia && (
                                    <div className="text-xs">
                                      <span className="text-slate-400">
                                        Fiscalía:
                                      </span>{" "}
                                      {item.fiscalia}
                                    </div>
                                  )}
                                  {item.locker && (
                                    <div className="text-xs">
                                      <span className="text-slate-400">
                                        Casillero:
                                      </span>{" "}
                                      {item.locker}
                                    </div>
                                  )}
                                  {!item.fiscalia && !item.locker && (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-slate-500">
                                  {new Date(
                                    item.createdAt.seconds * 1000
                                  ).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {currentView === "usuarios" && user.role === "admin" && (
            <div className="max-w-5xl mx-auto space-y-8">
              {/* Solicitudes Pendientes */}
              <div className="bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
                <div className="bg-orange-50 px-6 py-4 border-b border-orange-100 flex items-center space-x-2">
                  <Bell className="w-5 h-5 text-orange-500" />
                  <h3 className="font-bold text-orange-900">
                    Solicitudes Pendientes
                  </h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {pendingUsers.filter((u) => u.status === "pending").length ===
                  0 ? (
                    <p className="p-6 text-slate-400 text-center text-sm">
                      No hay solicitudes pendientes.
                    </p>
                  ) : (
                    pendingUsers
                      .filter((u) => u.status === "pending")
                      .map((u) => (
                        <div
                          key={u.id}
                          className="p-6 flex items-center justify-between"
                        >
                          <div>
                            <p className="font-bold text-slate-800">{u.name}</p>
                            <p className="text-sm text-slate-500">{u.email}</p>
                            <p className="text-xs text-orange-500 mt-1">
                              Solicitado: {formatDateTime(u.createdAt)}
                            </p>
                          </div>
                          <div className="flex space-x-3">
                            <button
                              onClick={() => handleUserAction(u.id, "delete")}
                              className="text-red-500 hover:text-red-700 text-sm font-medium px-3 py-2"
                            >
                              Rechazar
                            </button>
                            <button
                              onClick={() => handleUserAction(u.id, "approve")}
                              className="bg-[#00A8E8] hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                              Aprobar Acceso
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Lista de Usuarios Activos */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800">
                    Auxiliares Activos
                  </h3>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-white text-slate-500 text-xs uppercase font-semibold">
                    <tr>
                      <th className="px-6 py-3">Nombre</th>
                      <th className="px-6 py-3">Email</th>
                      <th className="px-6 py-3">Rol</th>
                      <th className="px-6 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {pendingUsers
                      .filter(
                        (u) => u.status === "active" || u.role === "admin"
                      )
                      .map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 font-medium text-slate-800">
                            {u.name || "Sin nombre"}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {u.email}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold uppercase ${
                                u.role === "admin"
                                  ? "bg-purple-50 text-purple-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {u.role !== "admin" && (
                              <button
                                onClick={() => handleUserAction(u.id, "delete")}
                                className="text-red-400 hover:text-red-600 flex items-center text-xs"
                              >
                                <LogOut className="w-3 h-3 mr-1" /> Revocar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL (Ruteo) ---
export default function App() {
  const [view, setView] = useState("welcome");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Inicialización de Auth Segura (Mandatory Pattern)
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== "undefined" && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else if (!auth.currentUser) {
        // Fallback a anónimo si no hay token (puede fallar si está desactivado en consola, pero necesario para init)
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.log(
            "Auth anónimo no disponible, esperando token personalizado..."
          );
        }
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setIsConnected(!!currentUser);
      if (!currentUser) {
        // Si se desconecta, intentamos reconectar silenciosamente
        // No forzamos un login completo para no interferir con la UX pública
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
    setView("dashboard");
  };

  const handleLogout = () => {
    // NO hacemos signOut de Firebase para no perder la conexión de la app pública
    setUser(null);
    setView("login");
  };

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100 text-[#00A8E8] font-bold animate-pulse">
        Cargando Sistema...
      </div>
    );

  // Router
  switch (view) {
    case "welcome":
      return (
        <PublicRegistration onViewChange={setView} isConnected={isConnected} />
      );
    case "login":
      return <AuthScreen onViewChange={setView} onLogin={handleLogin} />;
    case "dashboard":
      return user && (user.role === "admin" || user.role === "auxiliar") ? (
        <Dashboard user={user} onLogout={handleLogout} />
      ) : (
        <AuthScreen onViewChange={setView} onLogin={handleLogin} />
      );
    default:
      return (
        <PublicRegistration onViewChange={setView} isConnected={isConnected} />
      );
  }
}
