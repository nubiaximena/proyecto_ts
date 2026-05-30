"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const app = (0, express_1.default)();
const JWT_SECRET = 'clave_super_secreta_jwt_admin_2026';
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
// CLASES TS
class Platillo {
    constructor(nombre, precio) {
        this.nombre = nombre;
        this.precio = precio;
    }
    getInfo() {
        return { nombre: this.nombre, precio: this.precio };
    }
}
class Comanda {
    constructor(id, fecha, numero_mesa, cod_atendio, platillos) {
        this.fecha = fecha;
        this.numero_mesa = numero_mesa;
        this.cod_atendio = cod_atendio;
        this.platillos = platillos;
        this.estado = 'Pendiente';
        this.id = id;
    }
    get idComanda() { return this.id; }
    get status() { return this.estado; }
    set status(nuevoEstado) { this.estado = nuevoEstado; }
    toJSON() {
        return {
            id: this.id,
            fecha: this.fecha.toLocaleString(),
            mesa: this.numero_mesa,
            atendio: this.cod_atendio,
            platillos: this.platillos.map(p => p.getInfo()),
            estado: this.estado
        };
    }
}
// BASE DE DATOS VOLÁTIL
const usuarios = {
    "mesero": { clave: "123", rol: "mesero", id_empleado: 101 },
    "cocinero": { clave: "123", rol: "cocinero", id_empleado: 102 },
    "admin": { clave: "123", rol: "admin", id_empleado: 999 }
};
let inventarioPlatillos = [
    new Platillo("Tacos", 15),
    new Platillo("Enchiladas", 85)
];
let colaComandas = [];
let contadorIdComanda = 1;
function requiereRol(rolesPermitidos) {
    return (req, res, next) => {
        const token = req.cookies.token;
        if (!token)
            return res.redirect('/');
        try {
            const decodificado = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            req.usuario = decodificado;
            if (!rolesPermitidos.includes(req.usuario.rol)) {
                return res.status(403).send('<h1>403 - No autorizado</h1><a href="/dashboard">Regresar</a>');
            }
            next();
        }
        catch (error) {
            res.clearCookie('token');
            return res.redirect('/');
        }
    };
}
// RUTAS
app.get('/', (req, res) => {
    res.send(`
        <h2>Login TS - Seguridad de Software</h2>
        <form action="/login" method="POST">
            Usuario: <input type="text" name="usuario" required><br>
            Clave: <input type="password" name="clave" required><br>
            <button type="submit">Entrar</button>
        </form>
    `);
});
app.post('/login', (req, res) => {
    const { usuario, clave } = req.body;
    const user = usuarios[usuario];
    if (user && user.clave === clave) {
        const token = jsonwebtoken_1.default.sign({
            nombre: usuario,
            rol: user.rol,
            id: user.id_empleado
        }, JWT_SECRET, { expiresIn: '1h' });
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
        res.redirect('/dashboard');
    }
    else {
        res.send('Error de acceso.');
    }
});
// Dashboard Principal
app.get('/dashboard', requiereRol(['mesero', 'cocinero', 'admin']), (req, res) => {
    const { rol, nombre } = req.usuario;
    let html = `<h1>Dashboard - ${nombre} (${rol})</h1><a href="/logout">Salir</a><hr>`;
    // Sección CRUD Platillos (Solo Admin)
    if (rol === 'admin') {
        html += `<h3>Gestión de Platillos (CRUD)</h3>
    <form action="/platillos/crear" method="POST">
        Nombre: <input type="text" name="nombre" required>
        Precio: <input type="number" name="precio" required>
        <button type="submit">Agregar al Menú</button>
    </form>
    <br>
    <table border="1" cellpadding="5">
        <tr><th>Platillo</th><th>Precio Actual</th><th>Acciones</th></tr>`;
        inventarioPlatillos.forEach((p, index) => {
            const info = p.getInfo();
            html += `
        <tr>
            <td>${info.nombre}</td>
            <td>$${info.precio}</td>
            <td>
                <form action="/platillos/editar/${index}" method="POST" style="display:inline;">
                    <input type="number" name="precio" placeholder="Nuevo precio" step="0.01" style="width:80px" required>
                    <button type="submit">Actualizar</button>
                </form>
                | 
                <a href="/platillos/eliminar/${index}" onclick="return confirm('¿Seguro?')">
                    <button type="button" style="color:red">Eliminar</button>
                </a>
            </td>
        </tr>`;
        });
        html += `</table><hr>`;
    }
    // Sección Crear Comanda (Mesero y Admin)
    if (rol === 'mesero' || rol === 'admin') {
        html += `<h3>Generar Nueva Comanda</h3>
        <form action="/comandas/crear" method="POST">
            Mesa: <input type="number" name="mesa" required>
            Platillo: <select name="indexPlatillo">
                ${inventarioPlatillos.map((p, i) => `<option value="${i}">${p.getInfo().nombre}</option>`).join('')}
            </select>
            <button type="submit">Enviar Orden</button>
        </form><hr>`;
    }
    // Sección Cocina (Cocinero y Admin)
    if (rol === 'cocinero' || rol === 'admin') {
        html += `<h3>Comandas Pendientes</h3><table border="1">
                <tr><th>ID</th><th>Mesa</th><th>Platillos</th><th>Estado</th><th>Acciones</th></tr>`;
        colaComandas.forEach(c => {
            const data = c.toJSON();
            html += `<tr>
                <td>${data.id}</td><td>${data.mesa}</td>
                <td>${data.platillos.map(p => p.nombre).join(', ')}</td>
                <td>${data.estado}</td>
                <td>
                    <a href="/comandas/atender/${data.id}">Atender</a> | 
                    <a href="/comandas/eliminar/${data.id}">Terminar</a>
                </td>
            </tr>`;
        });
        html += `</table>`;
    }
    res.send(html);
});
// LOGICA CRUD PLATILLOS 
app.post('/platillos/crear', requiereRol(['admin']), (req, res) => {
    const { nombre, precio } = req.body;
    inventarioPlatillos.push(new Platillo(nombre, parseFloat(precio)));
    res.redirect('/dashboard');
});
app.get('/platillos/eliminar/:id', requiereRol(['admin']), (req, res) => {
    inventarioPlatillos.splice(parseInt(req.params.id), 1);
    res.redirect('/dashboard');
});
//LOGICA COMANDAS
app.post('/comandas/crear', requiereRol(['mesero', 'admin']), (req, res) => {
    const { mesa, indexPlatillo } = req.body;
    const platilloSeleccionado = inventarioPlatillos[parseInt(indexPlatillo)];
    const nuevaComanda = new Comanda(contadorIdComanda++, new Date(), parseInt(mesa), req.usuario.id, [platilloSeleccionado]);
    colaComandas.push(nuevaComanda);
    res.redirect('/dashboard');
});
//ruta de atender
app.get('/comandas/atender/:id', requiereRol(['cocinero', 'admin']), (req, res) => {
    // Agregamos "as string" dentro del parseInt
    const comanda = colaComandas.find(c => c.idComanda === parseInt(req.params.id));
    if (comanda)
        comanda.status = 'En Preparación';
    res.redirect('/dashboard');
});
//eliminar
app.get('/comandas/eliminar/:id', requiereRol(['cocinero', 'admin']), (req, res) => {
    // También aquí agregamos "as string"
    colaComandas = colaComandas.filter(c => c.idComanda !== parseInt(req.params.id));
    res.redirect('/dashboard');
});
//UPDATE: cambiar precio de un platillo solo admin 
app.post('/platillos/editar/:id', requiereRol(['admin']), (req, res) => {
    const id = parseInt(req.params.id);
    const nuevoPrecio = parseFloat(req.body.precio);
    if (inventarioPlatillos[id]) {
        // En una clase, podrías crear un método setPrecio, 
        // pero aquí accedemos directo para simplificar:
        inventarioPlatillos[id].precio = nuevoPrecio;
    }
    res.redirect('/dashboard');
});
app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});
// --- SERVIDOR HTTPS ---
const opcionesSSL = {
    key: fs_1.default.readFileSync('server.key'),
    cert: fs_1.default.readFileSync('server.cert')
};
https_1.default.createServer(opcionesSSL, app).listen(3000, () => {
    console.log(' Servidor TS seguro en https://localhost:3000');
});
