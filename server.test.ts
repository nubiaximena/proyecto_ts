import request from 'supertest';
import app from './app';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'clave_super_secreta_jwt_admin_2026';

function generarToken(rol: string, nombre: string, id: number): string {
    return jwt.sign({ nombre, rol, id }, JWT_SECRET, { expiresIn: '1h' });
}

describe('GET /', () => {
    test('Debe retornar 200 y mostrar el formulario de login', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Login');
        expect(res.text).toContain('<form');
    });
});

describe('POST /login', () => {
    test('Login exitoso con mesero debe redirigir a /dashboard', async () => {
        const res = await request(app)
            .post('/login')
            .send('usuario=mesero&clave=123')
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/dashboard');
    });

    test('Login exitoso con admin debe redirigir a /dashboard', async () => {
        const res = await request(app)
            .post('/login')
            .send('usuario=admin&clave=123')
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/dashboard');
    });

    test('Login exitoso con cocinero debe redirigir a /dashboard', async () => {
        const res = await request(app)
            .post('/login')
            .send('usuario=cocinero&clave=123')
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/dashboard');
    });

    test('Login con contrasena incorrecta debe retornar 401', async () => {
        const res = await request(app)
            .post('/login')
            .send('usuario=mesero&clave=incorrecta')
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect(res.status).toBe(401);
        expect(res.body.status).toBe('error');
    });

    test('Login con usuario inexistente debe retornar 401', async () => {
        const res = await request(app)
            .post('/login')
            .send('usuario=fantasma&clave=123')
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect(res.status).toBe(401);
    });

    test('Login con campos vacios debe retornar 400', async () => {
        const res = await request(app)
            .post('/login')
            .send('usuario=&clave=')
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect(res.status).toBe(400);
    });

    test('Login exitoso debe establecer cookie con token', async () => {
        const res = await request(app)
            .post('/login')
            .send('usuario=mesero&clave=123')
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect(res.headers['set-cookie']).toBeDefined();
        const cookie = res.headers['set-cookie'][0];
        expect(cookie).toContain('token=');
        expect(cookie).toContain('HttpOnly');
    });
});

describe('GET /dashboard', () => {
    test('Sin token debe redirigir a /', async () => {
        const res = await request(app).get('/dashboard');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/');
    });

    test('Con token de mesero debe retornar 200', async () => {
        const token = generarToken('mesero', 'mesero', 101);
        const res = await request(app)
            .get('/dashboard')
            .set('Cookie', `token=${token}`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('mesero');
    });

    test('Con token de cocinero debe retornar 200', async () => {
        const token = generarToken('cocinero', 'cocinero', 102);
        const res = await request(app)
            .get('/dashboard')
            .set('Cookie', `token=${token}`);
        expect(res.status).toBe(200);
    });

    test('Con token de admin debe retornar 200', async () => {
        const token = generarToken('admin', 'admin', 999);
        const res = await request(app)
            .get('/dashboard')
            .set('Cookie', `token=${token}`);
        expect(res.status).toBe(200);
    });

    test('Con token invalido debe redirigir a /', async () => {
        const res = await request(app)
            .get('/dashboard')
            .set('Cookie', 'token=token_invalido');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/');
    });
});

describe('POST /platillos/crear', () => {
    test('Admin puede crear un platillo', async () => {
        const token = generarToken('admin', 'admin', 999);
        const res = await request(app)
            .post('/platillos/crear')
            .set('Cookie', `token=${token}`)
            .send('nombre=Pozole&precio=120')
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/dashboard');
    });

    test('Mesero no puede crear platillos debe retornar 401', async () => {
        const token = generarToken('mesero', 'mesero', 101);
        const res = await request(app)
            .post('/platillos/crear')
            .set('Cookie', `token=${token}`)
            .send('nombre=Tamales&precio=50')
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect(res.status).toBe(401);
    });

    test('Crear platillo sin precio debe retornar 400', async () => {
        const token = generarToken('admin', 'admin', 999);
        const res = await request(app)
            .post('/platillos/crear')
            .set('Cookie', `token=${token}`)
            .send('nombre=SinPrecio&precio=')
            .set('Content-Type', 'application/x-www-form-urlencoded');
        expect(res.status).toBe(400);
    });
});

describe('GET /platillos/eliminar/:id', () => {
    test('Admin puede eliminar un platillo existente', async () => {
        const token = generarToken('admin', 'admin', 999);
        const res = await request(app)
            .get('/platillos/eliminar/0')
            .set('Cookie', `token=${token}`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/dashboard');
    });

    test('Eliminar platillo inexistente debe retornar 404', async () => {
        const token = generarToken('admin', 'admin', 999);
        const res = await request(app)
            .get('/platillos/eliminar/999')
            .set('Cookie', `token=${token}`);
        expect(res.status).toBe(404);
    });
});

describe('GET /logout', () => {
    test('Logout debe redirigir a / y limpiar cookie', async () => {
        const token = generarToken('mesero', 'mesero', 101);
        const res = await request(app)
            .get('/logout')
            .set('Cookie', `token=${token}`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/');
        const setCookie = res.headers['set-cookie'];
	const cookies = Array.isArray(setCookie) ? setCookie : [];
	const tokenCookie = cookies.find((c: string) => c.startsWith('token='));
	expect(tokenCookie).toContain('token=;');
    });
});
