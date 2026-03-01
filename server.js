const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// =======================
// CONFIG BANCO POSTGRESQL
// =======================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Criar tabelas automaticamente
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS servidores (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        matricula VARCHAR(50)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ferias (
        id SERIAL PRIMARY KEY,
        servidor_id INTEGER REFERENCES servidores(id) ON DELETE CASCADE,
        data_inicio DATE NOT NULL,
        data_fim DATE NOT NULL,
        ano_referencia INTEGER,
        status VARCHAR(50) DEFAULT 'aprovado'
      );
    `);

    console.log("Banco conectado e tabelas prontas.");
  } catch (err) {
    console.error("Erro ao iniciar banco:", err);
  }
}

initDB();

// =======================
// CONFIG EXPRESS
// =======================
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: "sbca-secret",
    resave: false,
    saveUninitialized: true,
  })
);

// =======================
// ROTAS
// =======================

// Página inicial
app.get("/", async (req, res) => {
  const servidores = await pool.query("SELECT * FROM servidores ORDER BY nome");
  const ferias = await pool.query(`
    SELECT f.*, s.nome 
    FROM ferias f
    JOIN servidores s ON f.servidor_id = s.id
    ORDER BY f.data_inicio
  `);

  res.render("index", {
    servidores: servidores.rows,
    ferias: ferias.rows,
  });
});

// Cadastrar servidor
app.post("/servidor", async (req, res) => {
  const { nome, matricula } = req.body;

  await pool.query(
    "INSERT INTO servidores (nome, matricula) VALUES ($1, $2)",
    [nome, matricula]
  );

  res.redirect("/");
});

// Cadastrar férias
app.post("/ferias", async (req, res) => {
  const { servidor_id, data_inicio, data_fim, ano_referencia } = req.body;

  await pool.query(
    `INSERT INTO ferias (servidor_id, data_inicio, data_fim, ano_referencia)
     VALUES ($1, $2, $3, $4)`,
    [servidor_id, data_inicio, data_fim, ano_referencia]
  );

  res.redirect("/");
});

// =======================
// INICIAR SERVIDOR
// =======================
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
