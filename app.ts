import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { body, validationResult } from 'express-validator';

const app = express();
const JWT_SECRET = 'clave_super_secreta_jwt_admin_2026';

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "https://trusted.cdn.com"],
                styleSrc: ["'self'", "https://fonts.googleapis.com"],
                imgSrc: ["'self'", "data:", "https:"],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: [],
            },
        },
        hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
        frameguard: { action: 'deny' },
        noSniff: true,
        referrerPolicy: { policy: 'no-referrer' },
    })
);

app.use((req, res, next) => {
    req.setTimeout(3000);
    res.setTimeout(3000);
    next();
});

app.use(cors({
    origin: 'https://localhost:3000',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    credentials: true
}));

const limiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 10,
    message: "Limite de peticiones excedido. Intenta en 5 minutos.",
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;
    public fields?: any[];
    constructor(message: string, statusCode = 500) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = true;
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
    }
}
class NotFoundError extends AppError {
    constructor(resource = "Recurso") { super(`${resource} no encontrado`, 404); }
}
class ValidationError extends AppError {
    constructor(message: string, fields: any[] = []) { super(message, 400); this.fields = fields; }
}
class UnauthorizedError extends AppError {
    constructor(message = "No autorizado") { super(message, 401); }
}

class Platillo {
    constructor(private nombre: string, private precio: number) {}
    public getInfo() { return { nombre: this.nombre, precio: this.precio }; }
}

class Comanda {
    private id: number;
    private estado: string = 'Pendiente';
    constructor(id: number, private fecha: Date, private numero_mesa: number, private cod_atendio: number, private platillos: Platillo[]) { this.id = id; }
    public get idComanda() { return this.id; }
    public get status() { return this.estado; }
    public set status(nuevoEstado: string) { this.estado = nuevoEstado; }
    public toJSON() {
        return { id: this.id, fecha: this.fecha.toLocaleString(), mesa: this.numero_mesa, atendio: this.cod_atendio, platillos: this.platillos.map(p => p.getInfo()), estado: this.estado };
    }
}

const usuarios: any = {
    "mesero": { clave: "123", rol: "mesero", id_empleado: 101 },
    "cocinero": { clave: "123", rol: "cocinero", id_empleado: 102 },
    "admin": { clave: "123", rol: "admin", id_empleado: 999 }
};

export let inventarioPlatillos: Platillo[] = [
    new Platillo("Tacos", 15),
    new Platillo("Enchiladas", 85)
];
export let colaComandas: Comanda[] = [];
export let contadorIdComanda = 1;

interface AuthRequest extends Request { usuario?: any; }
function requiereRol(rolesPermitidos: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const token = req.cookies.token;
        if (!token) return res.redirect('/');
        try {
            const decodificado = jwt.verify(token, JWT_SECRET);
            req.usuario = decodificado;
            if (!rolesPermitidos.includes(req.usuario.rol)) {
                return next(new UnauthorizedError("No tienes permisos para ver esta seccion"));
            }
            next();
        } catch (error) {
            res.clearCookie('token');
            return res.redirect('/');
        }
    };
}

app.get('/', (req, res) => {
    res.send('<h2>Login TS</h2><form action="/login" method="POST">Usuario: <input type="text" name="usuario" required><br>Clave: <input type="password" name="clave" required><br><button type="submit">Entrar</button></form>');
});

app.post('/login',
    body("usuario").trim().escape().notEmpty(),
    body("clave").trim().escape().notEmpty(),
    (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return next(new ValidationError("Faltan campos requeridos", errors.array()));
        const { usuario, clave } = req.body;
        const user = usuarios[usuario];
        if (user && user.clave === clave) {
            const token = jwt.sign({ nombre: usuario, rol: user.rol, id: user.id_empleado }, JWT_SECRET, { expiresIn: '1h' });
            res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
            res.redirect('/dashboard');
        } else {
            return next(new UnauthorizedError("Credenciales invalidas"));
        }
    }
);

app.get('/dashboard', requiereRol(['mesero', 'cocinero', 'admin']), (req: AuthRequest, res) => {
    const { rol, nombre } = req.usuario;
    res.send(`<h1>Dashboard - ${nombre} (${rol})</h1>`);
});

app.post('/platillos/crear', requiereRol(['admin']),
    body("nombre").trim().escape().notEmpty(),
    body("precio").isNumeric(),
    (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return next(new ValidationError("Error al crear platillo", errors.array()));
        inventarioPlatillos.push(new Platillo(req.body.nombre, parseFloat(req.body.precio)));
        res.redirect('/dashboard');
    }
);

app.get('/platillos/eliminar/:id', requiereRol(['admin']), (req: Request, res: Response, next: NextFunction) => {
    const id = parseInt(req.params.id as string);
    if (!inventarioPlatillos[id]) return next(new NotFoundError("Platillo"));
    inventarioPlatillos.splice(id, 1);
    res.redirect('/dashboard');
});

app.post('/platillos/editar/:id', requiereRol(['admin']),
    body("precio").isNumeric(),
    (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return next(new ValidationError("Error al editar precio", errors.array()));
        const id = parseInt(req.params.id as string);
        if (inventarioPlatillos[id]) {
            (inventarioPlatillos[id] as any).precio = parseFloat(req.body.precio);
            res.redirect('/dashboard');
        } else {
            return next(new NotFoundError("Platillo"));
        }
    }
);

app.post('/comandas/crear', requiereRol(['mesero', 'admin']),
    body("mesa").isNumeric(),
    body("indexPlatillo").isNumeric(),
    (req: AuthRequest, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return next(new ValidationError("Datos invalidos en comanda", errors.array()));
        const platilloSeleccionado = inventarioPlatillos[parseInt(req.body.indexPlatillo)];
        colaComandas.push(new Comanda(contadorIdComanda++, new Date(), parseInt(req.body.mesa), req.usuario.id, [platilloSeleccionado]));
        res.redirect('/dashboard');
    }
);

app.get('/comandas/atender/:id', requiereRol(['cocinero', 'admin']), (req: Request, res: Response, next: NextFunction) => {
    const comanda = colaComandas.find(c => c.idComanda === parseInt(req.params.id as string));
    if (!comanda) return next(new NotFoundError("Comanda"));
    comanda.status = 'En Preparacion';
    res.redirect('/dashboard');
});

app.get('/comandas/eliminar/:id', requiereRol(['cocinero', 'admin']), (req: Request, res: Response, next: NextFunction) => {
    const comandaExiste = colaComandas.some(c => c.idComanda === parseInt(req.params.id as string));
    if (!comandaExiste) return next(new NotFoundError("Comanda"));
    colaComandas = colaComandas.filter(c => c.idComanda !== parseInt(req.params.id as string));
    res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof AppError && err.isOperational) {
        return res.status(err.statusCode).json({
            status: "error",
            message: err.message,
            ...(err.fields && { fields: err.fields })
        });
    }
    return res.status(500).json({ status: "error", message: "Error interno." });
};

app.use(errorHandler);

export default app;
