// Mural de recados: cada recado é um arquivo JSON no Vercel Blob (prefixo recados/).
const { put, list, del } = require("@vercel/blob");

const PREFIXO = "recados/";

async function listarBlobs() {
  const todos = [];
  let cursor;
  do {
    const r = await list({ prefix: PREFIXO, limit: 1000, cursor });
    todos.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return todos;
}

async function lerRecados() {
  const blobs = await listarBlobs();
  const itens = await Promise.all(blobs.map(async (b) => {
    try {
      const r = await fetch(b.url, { cache: "no-store" });
      const j = await r.json();
      return { id: b.pathname, nome: String(j.nome || ""), texto: String(j.texto || ""), quando: Number(j.quando) || 0 };
    } catch (e) { return null; }
  }));
  return itens.filter(Boolean).sort((a, b) => b.quando - a.quando);
}

function limpar(s, max) {
  return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      return res.status(200).json({ recados: await lerRecados() });
    }

    if (req.method === "POST") {
      let corpo = req.body || {};
      if (typeof corpo === "string") { try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; } }
      if (corpo.site) return res.status(201).json({ ok: true }); // campo-isca para robôs
      const nome = limpar(corpo.nome, 60);
      const texto = limpar(corpo.texto, 400);
      if (!nome || !texto) return res.status(400).json({ erro: "Preencha nome e mensagem." });
      const quando = Date.now();
      const caminho = PREFIXO + quando + "-" + Math.random().toString(36).slice(2, 8) + ".json";
      await put(caminho, JSON.stringify({ nome, texto, quando }), {
        access: "public", contentType: "application/json", addRandomSuffix: false
      });
      return res.status(201).json({ recado: { id: caminho, nome, texto, quando } });
    }

    if (req.method === "DELETE") {
      const chave = req.headers["x-admin-key"];
      if (!process.env.ADMIN_KEY || chave !== process.env.ADMIN_KEY) return res.status(401).json({ erro: "Chave inválida." });
      const id = String((req.query && req.query.id) || "");
      if (!id.startsWith(PREFIXO)) return res.status(400).json({ erro: "Recado inválido." });
      const alvo = (await listarBlobs()).find((b) => b.pathname === id);
      if (!alvo) return res.status(404).json({ erro: "Recado não encontrado." });
      await del(alvo.url);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ erro: "Método não permitido." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: "Não foi possível concluir agora." });
  }
};
