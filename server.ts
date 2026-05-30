import express, { Request, Response, NextFunction } from 'express';
import https from 'https';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

const app = express();
const JWT_SECRET = 'clave_super_secreta_jwt_admin_2026';


app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CLASES TS

class Platillo {
    constructor(private nombre: string, private precio: number) {}

    public getInfo() {
        return { nombre: this.nombre, precio: this.precio };
    }
}

class Comanda {
    private id: number;
    private estado: string = 'Pendiente';

    constructor(
        id: number,
        private fecha: Date,
        private numero_mesa: number,
        private cod_atendio: number,
        private platillos: Platillo[]
    ) {
        this.id = id;
    }

    public get idComanda() { return this.id; }
    public get status() { return this.estado; }
    public set status(nuevoEstado: string) { this.estado = nuevoEstado; }

    public toJSON() {
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
const usuarios: any = {
    "mesero": { clave: "123", rol: "mesero", id_empleado: 101 },
    "cocinero": { clave: "123", rol: "cocinero", id_empleado: 102 },
    "admin": { clave: "123", rol: "admin", id_empleado: 999 }
};

let inventarioPlatillos: Platillo[] = [
    new Platillo("Tacos", 15),
    new Platillo("Enchiladas", 85)
];

let colaComandas: Comanda[] = [];
let contadorIdComanda = 1;

// MIDDLEWARE DE SEGURIDAD
interface AuthRequest extends Request {
    usuario?: any;
}

function requiereRol(rolesPermitidos: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const token = req.cookies.token;
        if (!token) return res.redirect('/');

        try {
            const decodificado = jwt.verify(token, JWT_SECRET);
            req.usuario = decodificado;

            if (!rolesPermitidos.includes(req.usuario.rol)) {
                return res.status(403).send('<h1>403 - No autorizado</h1><a href="/dashboard">Regresar</a>');
            }
            next();
        } catch (error) {
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
        const token = jwt.sign({ 
            nombre: usuario, 
            rol: user.rol, 
            id: user.id_empleado 
        }, JWT_SECRET, { expiresIn: '1h' });

        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
        res.redirect('/dashboard');
    } else {
        res.send('Error de acceso.');
    }
});

// Dashboard Principal
app.get('/dashboard', requiereRol(['mesero', 'cocinero', 'admin']), (req: AuthRequest, res) => {
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
    
    inventarioPlatillos.splice(parseInt(req.params.id as string), 1);
    res.redirect('/dashboard');
});

//LOGICA COMANDAS
app.post('/comandas/crear', requiereRol(['mesero', 'admin']), (req: AuthRequest, res) => {
    const { mesa, indexPlatillo } = req.body;
    const platilloSeleccionado = inventarioPlatillos[parseInt(indexPlatillo)];
    
    const nuevaComanda = new Comanda(
        contadorIdComanda++,
        new Date(),
        parseInt(mesa),
        req.usuario.id,
        [platilloSeleccionado]
    );

    colaComandas.push(nuevaComanda);
    res.redirect('/dashboard');
});


//ruta de atender
app.get('/comandas/atender/:id', requiereRol(['cocinero', 'admin']), (req, res) => {
    // Agregamos "as string" dentro del parseInt
    const comanda = colaComandas.find(c => c.idComanda === parseInt(req.params.id as string));
    if (comanda) comanda.status = 'En Preparación';
    res.redirect('/dashboard');
});

//eliminar
app.get('/comandas/eliminar/:id', requiereRol(['cocinero', 'admin']), (req, res) => {
    // También aquí agregamos "as string"
    colaComandas = colaComandas.filter(c => c.idComanda !== parseInt(req.params.id as string));
    res.redirect('/dashboard');
});

//UPDATE: cambiar precio de un platillo solo admin 
app.post('/platillos/editar/:id', requiereRol(['admin']), (req, res) => {
    const id = parseInt(req.params.id as string);
    const nuevoPrecio = parseFloat(req.body.precio);
    
    if (inventarioPlatillos[id]) {
        // En una clase, podrías crear un método setPrecio, 
        // pero aquí accedemos directo para simplificar:
        (inventarioPlatillos[id] as any).precio = nuevoPrecio; 
    }
    res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
