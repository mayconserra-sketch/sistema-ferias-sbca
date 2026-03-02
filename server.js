const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const { Pool } = require("pg");

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;

// ===============================
// BANCO POSTGRESQL
// ===============================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// ===============================
// CONFIG EXPRESS
// ===============================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: "sbca-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      sameSite: "none",
    },
  })
);

// ===============================
// MIDDLEWARE PROTEGER ROTAS
// ===============================
function verificarLogin(req, res, next) {
  if (!req.session.usuario) {
    return res.redirect("/login");
  }
  next();
}

// ===============================
// ROTAS
// ===============================

// Página Login
app.get("/login", (req, res) => {
  if (req.session.usuario) {
    return res.redirect("/");
  }
  res.render("login");
});

// Processar Login
app.post("/login", (req, res) => {
  const { usuario, senha } = req.body;

  if (usuario === "admin" && senha === "123") {
    req.session.usuario = usuario;
    return res.redirect("/");
  }

  res.send("Usuário ou senha inválidos");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// Página Principal (PROTEGIDA)
app.get("/", verificarLogin, async (req, res) => {
  try {
    const servidores = await pool.query(
      "SELECT * FROM servidores ORDER BY nome"
    );

    const ferias = await pool.query(`
      SELECT f.*, s.nome
      FROM ferias f
      JOIN servidores s ON f.servidor_id = s.id
      ORDER BY f.data_inicio
    `);

    res.render("index", {
      usuario: req.session.usuario,
      servidores: servidores.rows,
      ferias: ferias.rows,
    });
  } catch (error) {
    console.error(error);
    res.send("Erro ao carregar dados");
  }
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
