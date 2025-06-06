import bcrypt from "bcrypt";
import { check, validationResult } from "express-validator";
import { emailRegistro, olvidePassword } from "../helpers/emails.js";
import { generarId, generarJWT } from "../helpers/token.js";
import Usuario from "../models/Usuario.js";

// CONTROLLERS
// -> Login
const formularioLogin = (req, res) => {
  res.render("auth/login", {
    pagina: "Iniciar Sesion",
    csrfToken: req.csrfToken(),
  });
};

// -> Autenticar/login
const autenticar = async (req, res) => {
  //Validar de email y password
  await check("email")
    .isEmail()
    .withMessage("El email es obligatorio")
    .run(req);
  await check("password")
    .notEmpty()
    .withMessage("El password es obligatorio")
    .run(req);

  let resultado = validationResult(req);
  // Verificar que el resultado este vacio
  if (!resultado.isEmpty()) {
    return res.render("auth/login", {
      pagina: "Iniciar Sesion",
      csrfToken: req.csrfToken(),
      errores: resultado.array(),
    });
  }
  // Extraer el email y password
  const { email, password } = req.body;
  // Comprobar si el usuario existe
  const usuario = await Usuario.findOne({ where: { email } });
  if (!usuario) {
    return res.render("auth/login", {
      pagina: "Iniciar Sesion",
      csrfToken: req.csrfToken(),
      errores: [{ msg: "El usuario no existe" }],
    });
  }
  // Comprobar si el usuario esta confirmado
  if (!usuario.confirmado) {
    return res.render("auth/login", {
      pagina: "Iniciar Sesion",
      csrfToken: req.csrfToken(),
      errores: [{ msg: "Tu cuenta no ha sido confirmada" }],
    });
  }
  // Revisar el password
  if (!usuario.verificarPassword(password)) {
    return res.render("auth/login", {
      pagina: "Iniciar Sesion",
      csrfToken: req.csrfToken(),
      errores: [{ msg: "El password es incorrecto" }],
    });
  }

  // Autenticar al usuario
  const token = generarJWT({id:usuario.id, nombre: usuario.nombre});
  console.log('token', token);

  // Almacenar en un cookie
  return res.cookie("_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
  }).redirect("/mis-propiedades");

};

// -> Registrar
const formularioRegistro = (req, res) => {
  res.render("auth/registro", {
    pagina: "Crear cuenta",
    csurfToken: req.csrfToken(),
  });
};

const registrar = async (req, res) => {
  //validar
  await check("nombre")
    .notEmpty()
    .withMessage("El nombre es obligatorio")
    .run(req);
  await check("email")
    .isEmail()
    .withMessage("El email es obligatorio")
    .run(req);
  await check("password")
    .isLength({ min: 6 })
    .withMessage("El password es obligatorio y debe ser minimo de 6 caracteres")
    .run(req);
  await check("repetir_password")
    .equals(req.body.password)
    .withMessage("Los passwords no son iguales")
    .run(req);

  let resultado = validationResult(req);

  // Verificar que el resultado este vacio

  if (!resultado.isEmpty()) {
    return res.render("auth/registro", {
      pagina: "Crear cuenta",
      //Errores
      errores: resultado.array(),
      usuario: {
        nombre: req.body.nombre,
        email: req.body.email,
      },
      csurfToken: req.csrfToken(),
    });
  }

  //Extraer los datos
  const { nombre, email, password } = req.body;

  //Verificar que el usuario no este duplicado
  const existeUsuario = await Usuario.findOne({ where: { email } });

  if (existeUsuario) {
    return res.render("auth/registro", {
      pagina: "Crear Cuenta",
      errores: [{ msg: "El usuario ya esta registrado" }],
      csurfToken: req.csrfToken(),
      usuario: {
        nombre: nombre,
        email: email,
      },
    });
  }
  // Almacenar el usuario
  const usuario = await Usuario.create({
    nombre,
    email,
    password,
    token: generarId(),
  });

  // Enviar email de confirmacion

  emailRegistro({
    nombre: usuario.nombre,
    email: usuario.email,
    token: usuario.token,
  });

  //Mostrar mensaje de confirmacion
  res.render("templates/mensaje", {
    pagina: "Cuenta Creada Correctamente",
    mensaje: "Hemos enviado un email de confirmacion, presiona en el enalce",
  });
};

// -> Confirmar cuenta (comprobar)
const confirmar = async (req, res) => {
  const { token } = req.params;

  //Verificar si el token es valido para confirmar tu cuenta
  const usuario = await Usuario.findOne({
    where: {
      token,
    },
  });

  if (!usuario) {
    return res.render("auth/confirmar-cuenta", {
      pagina: "Error al confirmar cuenta",
      mensaje: "Hubo un error al confirmar tu cuenta",
      error: true,
    });
  }
  try {
    usuario.token = null;
    usuario.confirmado = true;
    await usuario.save();
    res.render("auth/confirmar-cuenta", {
      pagina: "Cuenta confirmada",
      mensaje: "Tu cuenta ha sido confirmada correctamente",
    });
  } catch (error) {
    return res.render("auth/confirmar-cuenta", {
      pagina: "Error al confirmar cuenta",
      mensaje: "Hubo un error al confirmar tu cuenta",
      error: true,
    });
  }
};

// -> Olvide mi pass
const formularioOlvidePassword = (req, res) => {
  res.render("auth/olvide-password", {
    pagina: "Recupera tu acceso a Bienes raices",
    csurfToken: req.csrfToken(),
  });
};

//Reset de password
const resetPassword = async (req, res) => {
  //validar

  await check("email")
    .isEmail()
    .withMessage("El email es obligatorio")
    .run(req);

  let resultado = validationResult(req);

  // Verificar que el resultado este vacio

  if (!resultado.isEmpty()) {
    return res.render("auth/olvide-password", {
      pagina: "Recupera tu acceso a Bienes raices",
      _csrf: req.csrfToken(),
      errores: resultado.array(),
    });
  }
  // Si el email existe
  const { email } = req.body;
  const existeUsuario = await Usuario.findOne({ where: { email } });

  if (!existeUsuario) {
    return res.render("auth/olvide-password", {
      pagina: "Recupera tu acceso a Bienes raices",
      _csrf: req.csrfToken(),
      errores: [{ msg: "El email no pertenece a ningun usuario" }],
    });
  }
  // Generar un token y enviar al email

  existeUsuario.token = generarId();
  await existeUsuario.save();
  //Enviar el email
  olvidePassword({
    nombre: existeUsuario.nombre,
    email: existeUsuario.email,
    token: existeUsuario.token,
  });

  //Mostrar mensaje de confirmacion
  res.render("templates/mensaje", {
    pagina: "Reestablece tu password",
    mensaje: "Hemos enviado un email con las instrucciones",
  });
};
// -> Comprobar token
const comporbararToken = async (req, res) => {
  const { token } = req.params;
  //Verificar si el token es valido para confirmar tu cuenta
  const usuario = await Usuario.findOne({
    where: {
      token,
    },
  });

  if (!usuario) {
    return res.render("auth/confirmar-cuenta", {
      pagina: "Restablecer password",
      mensaje: "Hubo un error al comprobar tu identidad",
      error: true,
    });
  }
  // Mostrar formulario para nuevo password
  res.render("auth/reset-password", {
    pagina: "Restablece tu password",
    csrfToken: req.csrfToken(),
  });
};

// -> Nuevo password
const nuevoPassword = async (req, res) => {
  //validar el nuevo password
  await check("password")
    .isLength({ min: 6 })
    .withMessage("El password es obligatorio y debe ser minimo de 6 caracteres")
    .run(req);

  let resultado = validationResult(req);

  if (!resultado.isEmpty()) {
    return res.render("auth/reset-password", {
      pagina: "Restablece tu password",
      csrfToken: req.csrfToken(),
      errores: resultado.array(),
    });
  }

  const { token } = req.params;
  const { password } = req.body;

  //identificar al usuario
  const usuario = await Usuario.findOne({ where: { token } });

  // hash el nuevo password
  const salt = await bcrypt.genSalt(10);
  usuario.password = await bcrypt.hash(password, salt);
  usuario.token = null;
  await usuario.save();

  res.render("auth/confirmar-cuenta", {
    pagina: "Password restablecido",
    mensaje: "El password se ha modificado correctamente",
  });
};

export {
  autenticar,
  comporbararToken,
  confirmar,
  formularioLogin,
  formularioOlvidePassword,
  formularioRegistro,
  nuevoPassword,
  registrar,
  resetPassword
};

