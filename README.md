# GBP Pro — Deploy no Cloudflare Pages

## Estrutura do projeto

```
gbp-pro/
├── index.html                  ← app principal
├── functions/
│   └── api/
│       ├── places.js           ← proxy Google Places API
│       └── ai.js               ← proxy Claude API
└── wrangler.toml               ← config Cloudflare
```

---

## Passo a passo — Deploy no Cloudflare Pages

### 1. Criar conta no Cloudflare (gratuito)
Acesse https://dash.cloudflare.com e crie uma conta grátis.

---

### 2. Subir os arquivos no GitHub

1. Acesse https://github.com e crie uma conta (se não tiver)
2. Clique em **New repository** → nome: `gbp-pro` → **Create repository**
3. Faça upload dos arquivos:
   - Clique em **"uploading an existing file"**
   - Arraste TODOS os arquivos desta pasta (mantendo a estrutura de pastas)
   - Clique em **"Commit changes"**

> **Importante:** mantenha a estrutura exata:
> - `index.html` na raiz
> - `functions/api/places.js`
> - `functions/api/ai.js`

---

### 3. Conectar ao Cloudflare Pages

1. No Cloudflare Dashboard → **Workers & Pages** → **Create application**
2. Clique em **Pages** → **Connect to Git**
3. Autorize o GitHub → selecione o repositório `gbp-pro`
4. Em **Build settings**:
   - Framework preset: **None**
   - Build command: (deixe vazio)
   - Build output directory: `/` (ou `.`)
5. Clique em **Save and Deploy**

---

### 4. Configurar as chaves de API (variáveis de ambiente)

1. No Cloudflare Pages → seu projeto → **Settings** → **Environment variables**
2. Clique em **Add variable** e adicione:

   | Variable name    | Value                              |
   |------------------|------------------------------------|
   | GOOGLE_API_KEY   | AIzaSyCdcL0k4B-SJkKVFR_...        |
   | CLAUDE_API_KEY   | sk-ant-... (opcional)              |

3. Clique em **Save**
4. Vá em **Deployments** → clique nos 3 pontos → **Retry deployment**

---

### 5. Proteger sua Google API Key

1. Acesse https://console.cloud.google.com/apis/credentials
2. Clique na sua chave → **Edit**
3. Em **Application restrictions** → selecione **HTTP referrers**
4. Adicione:
   ```
   https://seu-projeto.pages.dev/*
   ```
5. Salve

---

### 6. Acessar o sistema

Seu site estará disponível em:
```
https://gbp-pro.pages.dev
```
(ou o nome que você escolheu)

---

## Uso

1. Abra o site
2. Vá em **Config** (menu lateral) e confirme que as chaves estão ativas
3. Na página **Início**, digite o nome e cidade do negócio
4. Clique em **Analisar Negócio**
5. Navegue pelos módulos e gere PDFs

---

## Custos

| Serviço | Custo |
|---------|-------|
| Cloudflare Pages | **Gratuito** (ilimitado) |
| Cloudflare Workers (proxy) | **Gratuito** (100k req/dia) |
| Google Places API | **Gratuito** até $200/mês (~2.800 buscas) |
| Claude API (opcional) | ~$0,003 por análise |

---

## Solução de problemas

**Erro "REQUEST_DENIED":** A Places API não está ativada. Acesse Google Cloud Console → APIs & Services → Enable APIs → ative "Places API".

**Erro 500 no proxy:** As variáveis de ambiente não foram salvas. Verifique em Settings → Environment variables.

**Página em branco:** Verifique se todos os arquivos foram enviados com a estrutura correta (functions/api/).
