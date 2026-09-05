# Sala de Controle

App pessoal de Thami e Del: contas da casa, lista de compras/estoque, agenda de compromissos, cadastro e "nem só boletos".

## O que já está pronto
- Login por e-mail/senha (Firebase Authentication)
- Sincronização em tempo real entre os dois celulares (Firestore)
- Fotos de comprovante comprimidas e guardadas dentro do próprio banco (sem custo de Storage)
- Instalável na tela do celular como app (PWA)

## Passo 1 — Colar as regras de segurança no Firebase
1. Acesse [console.firebase.google.com](https://console.firebase.google.com), abra o projeto **saladecontrole-3301c**
2. Vá em **Firestore Database → Regras**
3. Apague o conteúdo atual e cole o conteúdo do arquivo `firestore.rules` (esta pasta)
4. Clique em **Publicar**

Sem esse passo, o banco de dados fica com as regras padrão e ninguém consegue ler/gravar nada.

## Passo 2 — Publicar o app (gratuito)
A forma mais simples, sem instalar nada no computador:

1. Acesse [app.netlify.com/drop](https://app.netlify.com/drop)
2. Arraste a pasta inteira **sala-de-controle** (todos os arquivos juntos) para a página
3. Em alguns segundos, o Netlify gera um link tipo `https://algumnome.netlify.app`
4. Abra esse link no navegador do celular (Safari no iPhone, Chrome no Android)
5. No menu do navegador, escolha **"Adicionar à Tela de Início"** — o app aparece com o ícone

Repita a instalação nos dois celulares (Thami e Del), usando o mesmo link.

## Passo 3 — Entrar no app
Use o e-mail e a senha que vocês já cadastraram no Firebase Authentication.

## Se quiser trocar alguma imagem depois
As ilustrações ficam em `assets/`:
- `cadastro.jpg` — tela de Cadastro
- `contas.jpg` — aba Contas
- `compras.jpg` — aba Compras
- `agenda.jpg` — aba Agenda
- `extras.jpg` — aba Nem só boletos
- `icon-192.png` / `icon-512.png` — ícone do app no celular

Basta substituir o arquivo pelo novo, mantendo o mesmo nome, e publicar de novo (repetir o Passo 2).

## Se quiser trocar de nome de domínio ou hospedagem depois
Isso pode ser feito a qualquer momento, sem afetar os dados (eles ficam salvos no Firebase, não no site).
