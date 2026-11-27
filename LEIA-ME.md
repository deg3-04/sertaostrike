# SERTÃO STRIKE — FPS na rede local

Jogo de tiro em primeira pessoa no estilo Counter-Strike, leve e feito para jogar com os amigos na mesma rede (Wi-Fi ou cabo). Um computador roda o servidor e todo mundo joga pelo navegador: não é preciso instalar nada nos outros PCs, nem criar conta.

- **3 modos de jogo** (o anfitrião troca em ESC › Configurar partida › Modo de jogo):
  - **Mata-mata (todos contra todos)**: termina por tempo, por número de abates ou pelo que vier primeiro. Há critério de desempate e placar.
  - **Mata-mata em equipe (CT × TR)**: duas equipes equilibradas automaticamente; vence a equipe que chegar primeiro ao limite de abates (padrão 50) ou que tiver mais abates no fim do tempo. Fogo amigo desligado por padrão.
  - **Gun Game**: cada abate troca sua arma pela próxima da lista (Glock → USP-S → Five-SeveN → Desert Eagle → MP5-SD → UMP-45 → P90 → XM1014 → SSG 08 → M4A1-S → AK-47 → AUG → AWP → faca). Vence quem fizer o abate final com a faca. Uma facada rouba um nível da vítima.
  - **Capture a Bandeira (CT × TR)**: cada equipe tem uma bandeira na própria base (CT no norte, TR no sul). Encoste na bandeira inimiga para pegá-la e leve até a sua base, com a sua bandeira lá, para marcar um ponto. Se o portador morrer a bandeira cai: um inimigo pode pegá-la de novo e a equipe dona devolve à base só encostando nela (ou ela volta sozinha em 25 s). Vence quem chegar primeiro ao limite de capturas (padrão 3) ou tiver mais capturas no fim do tempo. O ícone da bandeira aparece através das paredes e a barra do topo mostra onde está cada uma.
- **Abates recompensam**: +25 de vida, pente recarregado, e bônus de sequência (5 abates seguidos = colete e capacete).
- **Um explosivo por jogador**: no menu de armas cada um escolhe o seu (granada explosiva, de luz, de fumaça ou mina) e renasce com 1. A única forma de ganhar outro é fazer um **Triple Kill** (e mais um a cada 3 abates na mesma sequência), até 3.
- **Ritmo rápido**: renascimento em 1,5 s, perto da ação (mas fora da mira inimiga), movimento 7% mais rápido e mais controle no ar; opção de pulo automático segurando espaço.
- **Dano 10% menor que o CS padrão** (ajustável em `DAMAGE_SCALE`, no arquivo `shared/constants.js`).
- **Dano por parte do corpo** (cabeça, tronco, abdômen e pernas), com colete, capacete, queda de dano por distância e balas que atravessam madeira e metal fino.
- **13 armas baseadas em modelos reais**, cada uma com dano, cadência, precisão, recuo e mobilidade próprios, além da faca, de três granadas (explosiva, de fumaça e de luz) e da **mina terrestre**.
- **Som realista dos tiros:** cada arma tem um disparo próprio, gerado a partir da física do tiro real (onda de choque, jato de gás, mecanismo da arma). De longe se ouve o estalo da bala antes do estrondo, o som chega atrasado conforme a distância, e o eco muda entre sala fechada e céu aberto. Dá para trocar por gravações reais (veja a seção 5).
- **Marcas de tiro realistas:** o furo muda conforme a superfície (alvenaria, madeira, metal, terra) e conforme o ângulo: de frente o furo é redondo; de lado ele fica oval e "puxado" na direção da bala, e em ângulos rasos aparece o sulco do raspão. As lascas saem na direção do ricochete.
- **Identificação de jogadores:** aliados com contorno, faixas e marcador na cor da equipe (vistos através das paredes); inimigos com contorno e marcador vermelhos só quando estão à vista. Dá para voltar ao modo clássico em Opções › Jogo.
- **9 personagens** (incluindo o chimpanzé João, o padre Lincuzinho, de batina e tonsura, e o Will, de óculos) e escolha do **lado de renascimento**. O tempo de renascimento e a proteção ao renascer são configuráveis.
- **Killfeed** no canto superior esquerdo com ícones de headshot, tiro através da parede, através da fumaça, no ar e sem luneta.
- **Bots** para completar a partida quando há pouca gente (fácil, normal ou difícil).
- **4 mapas** (o anfitrião troca em ESC › Configurar partida › Mapa):
  - **Vila Sertão**: vila nordestina com casas coloniais coloridas, igreja, praça com chafariz, bandeirinhas e mandacarus. Mais aberto, com linhas longas para rifles.
  - **Porto Delta**: porto industrial com contêineres no layout clássico de CS: base CT e base TR, bombsites A e B, meio com portas de madeira, "long" com portas, túneis cobertos e passarela elevada (short A). Mais fechado e rápido, com muitos ângulos e combates de curta e média distância.
  - **Galpão 7** (compacto, 48 × 48 m): pátios abertos ao norte e ao sul, galpão coberto no centro com contêineres e pilares, doca a céu aberto com plataforma elevada a oeste e escritórios com corredor estreito e salas a leste, ligados ao galpão por portas e janelas.
  - **Bunker 13** (compacto, 44 × 44 m): bases cobertas de concreto, corredores de 2 m de largura com janelas para um pátio central aberto e trincheiras a céu aberto nas laterais. Muito combate de perto, ideal para escopeta, SMG e faca.

- **Visual caprichado e leve:** salas, corredores e túneis ficam mais escuros que a rua, com cantos sombreados e lâmpadas que iluminam o ambiente (algumas piscam). Toda essa luz é calculada uma vez ao carregar o mapa, então não pesa durante o jogo. Os mapas têm placas e cartazes, fios entre as paredes, entulho e papéis no chão, grama nos mapas de terra e nuvens que se movem no céu.
- **Personagens mais vivos:** as pernas acompanham a direção em que o jogador anda (frente, lado, costas), o agachar é suave, há pulo e aterrissagem, e a recarga e a troca de arma aparecem para os outros. Ao morrer, o corpo tomba conforme o tiro (um tiro de AWP ou na cabeça empurra mais), quica no chão e os braços e pernas balançam.
- **Chat completo:** chat para todos e chat só da equipe, histórico com rolagem, emojis, mensagens rápidas de rádio estilo CS e opção de silenciar jogadores.

Tudo (gráficos, texturas, modelos e sons) é gerado pelo próprio jogo. Ele funciona sem internet.

---

## 1. Requisitos

| O quê | Observação |
|---|---|
| **Node.js 16 ou mais novo** (recomendado 18+) | só no computador que vai ser o servidor |
| Navegador moderno | Chrome, Edge (recomendados) ou Firefox, em todos os PCs |
| Mesma rede local | todos conectados no mesmo roteador / Wi-Fi |

> PostgreSQL e Python **não são necessários**. O jogo usa apenas o Node.js.

---

## 2. Como iniciar (passo a passo)

1. Extraia a pasta `sertao-strike` em qualquer lugar do computador que será o servidor.
2. Inicie o servidor:
   - **Windows:** dê dois cliques em **`iniciar-servidor.bat`**
   - **Linux / macOS:** no terminal, rode `./iniciar-servidor.sh` (ou `node server/index.js`)
3. A janela vai mostrar algo assim:

   ```
   SERTÃO STRIKE v1.4.0 — servidor no ar!
     Neste computador:   http://localhost:3000
     Na rede local (passe para os amigos):
        http://192.168.0.15:3000    (Wi-Fi)
   ```

4. **No seu PC**, abra o navegador em `http://localhost:3000`.
5. **Nos PCs dos amigos**, abram o endereço da rede local (ex.: `http://192.168.0.15:3000`). O mesmo endereço também aparece na tela inicial do jogo.
6. Cada um digita o **nick**, escolhe **personagem**, **lado de renascimento** e **armas**, e clica em **JOGAR**.
7. Todos entram na **sala de espera**. Lá dá para trocar personagem e armas e conversar. Cada um clica em **PRONTO** e o dono da sala clica em **INICIAR PARTIDA**, que só fica liberado quando **todos** estiverem prontos.

> **Firewall do Windows:** na primeira vez, o Windows pergunta se o Node.js pode acessar a rede. Marque **Redes privadas** e clique em **Permitir**. Se a pergunta não apareceu e os amigos não conseguem entrar, abra o **Prompt de Comando como administrador** e rode:
>
> ```
> netsh advfirewall firewall add rule name="Sertao Strike" dir=in action=allow protocol=TCP localport=3000
> ```

O primeiro jogador a entrar vira o **anfitrião** (dono da sala, com a coroa 👑): só ele altera as regras da partida (na sala ou em **ESC › Configurar partida**) e inicia a partida. Se ele sair, o próximo vira dono.

### Sala de espera
- Ninguém entra no mapa sozinho: todos aguardam na sala até o dono iniciar. Bots contam como prontos.
- **Música da sala de espera**: na tela principal e enquanto a partida não começa, toca `public/music/sala.m4a` em loop (para trocar, substitua esse arquivo mantendo o nome). O volume fica em ESC › Opções › Áudio › "Música da sala de espera". A música para quando a partida começa e volta na sala.
- **As regras são escolhidas na sala**, antes de começar: o dono define ali mesmo o modo (mata-mata, em equipe, Gun Game ou Capture a Bandeira), o mapa, como a partida termina, o tempo, o limite de abates e os bots ("Mais regras…" abre as demais opções). Os outros veem as regras, mas não mudam. Se o dono alterar alguma regra, o PRONTO de todos é desmarcado para que confirmem de novo.
- Durante a partida, modo, mapa, tempo e abates ficam travados (em ESC › Configurar partida aparecem bloqueados); as demais opções continuam ajustáveis.
- Quem chega com a partida **já em andamento** fica na sala e escolhe quando entrar (**ENTRAR NA PARTIDA**).
- No fim da partida, depois do placar, todos voltam para a sala com o **PRONTO** desmarcado.
- A sala é leve: o servidor não simula nada nem manda posições enquanto todos esperam (só uma mensagem pequena quando alguém entra, sai ou fica pronto), e o cenário de fundo é desenhado a no máximo 12 quadros por segundo.

---

## 3. Controles

| Ação | Tecla |
|---|---|
| Andar | W A S D |
| Pular | Espaço |
| Agachar | Ctrl (veja a dica abaixo) |
| Andar em silêncio | Shift |
| Atirar | Botão esquerdo |
| Luneta / facada forte / arremesso curto | Botão direito |
| Recarregar | R |
| Arma principal / pistola / faca | 1 / 2 / 3 |
| Granada explosiva / de luz / de fumaça | 4 / 5 / 6 |
| Mina terrestre (botão esquerdo planta) | 7 |
| Última arma | Q |
| Trocar de arma | Roda do mouse |
| Inspecionar arma | F |
| Placar | TAB (segurar) |
| Chat (todos) | Y ou Enter |
| Chat da equipe | U |
| Rádio: comandos / respostas / geral | Z / X / C, depois 1 a 6 |
| Trocar armas | B |
| Guia de equipamentos (só consulta) | M |
| Menu / opções | Esc |

Todas as teclas podem ser trocadas em **Opções › Teclas**.

> **Dica sobre o Ctrl:** no navegador, Ctrl+W fecha a aba. Por isso o jogo entra em **tela cheia** ao clicar em JOGAR: no Chrome e no Edge a tela cheia "trava" o teclado e o Ctrl+W deixa de fechar a aba. No Firefox, troque o agachar para **C** em Opções › Teclas. Mesmo assim, o navegador pede confirmação antes de sair da página.

---

## 4. Regras da partida

### Fim da partida e desempate
- **Por tempo**, **por abates** ou **o que vier primeiro** (padrão: 10 minutos ou 30 abates).
- **Pontos** = abates − suicídios (morrer com a própria granada tira 1 ponto). Em equipe, abater um aliado (só com fogo amigo ligado) também tira 1 ponto.
- **Em equipe**, o placar mostra as duas equipes lado a lado e o total de cada uma no topo da tela. Aliados aparecem no radar e com um marcador colorido sobre a cabeça.
- **No Gun Game**, o placar ordena por nível; o limite de abates não vale (vence quem completar as armas, ou quem estiver no nível mais alto quando o tempo acabar).
- **Critério de desempate** (configurável):
  - **Estatísticas** (padrão): menos mortes → mais headshots → mais dano causado → quem chegou primeiro à pontuação.
  - **Morte súbita**: se o tempo acabar empatado, o próximo abate de um dos líderes decide (limite de 2 minutos; depois disso valem as estatísticas).
- No fim aparece o **pódio** com o placar completo. A próxima partida começa sozinha depois de alguns segundos.
- **Início:** a partida só começa quando o dono da sala clica em **Iniciar partida**, com todos prontos (veja "Sala de espera").

### Abates em sequência
- Abates feitos com até 4 segundos de intervalo viram uma sequência: **Double Kill**, **Triple Kill**, **Quadra Kill**, **Penta Kill**, Hexa, Hepta, Octa, Nona, Deca e, daí para cima, **Godlike**. Todo mundo no mapa vê o nome (maior e mais chamativo a cada abate) com o nick de quem fez, e ouve um efeito de sintetizador que sobe de tom a cada abate da sequência (mais alto para quem fez).

### Renascimento
- **Tempo de renascimento** configurável em passos de 0,5 s (padrão 1,5 s). Enquanto espera, a câmera mostra quem te abateu e com quanta vida ele ficou.
- **Lado de renascimento:** *Base Norte (CT)*, *Base Sul (TR)* ou *Qualquer lugar*. No mata-mata em equipe, a escolha vira a preferência de equipe (respeitando o equilíbrio).
- **Onde renascer:** *Perto da ação* (padrão: a cerca de 16 m do inimigo mais próximo, fora da vista dele) ou *Seguro* (o mais longe possível dos inimigos).
- **Recompensa por abate:** vida recuperada (padrão 25, até 100), pente recarregado e bônus de sequência. Tudo configurável.
- **Proteção ao renascer** (padrão 1,5 s): você não leva dano, mas a proteção acaba assim que você atira.
- Trocar de arma com **B** vale na hora se você ainda estiver protegido; senão, vale no próximo renascimento (como no CS).

### Dano por parte do corpo
| Parte | Multiplicador | Protegida por |
|---|---|---|
| Cabeça | ×4 | capacete |
| Tronco | ×1 | colete |
| Abdômen | ×1,25 | colete |
| Pernas | ×0,75 | — |

- O **colete** e o **capacete** absorvem parte do dano. Quanto cada arma atravessa está na coluna "Penetra colete" do menu de armas.
- O dano **cai com a distância** de acordo com a arma (a escopeta cai rápido; o AWP quase não cai).
- **Paredes finas de madeira e metal** (caixotes, portas, barris) podem ser atravessadas por armas com boa penetração (fuzis e rifles de precisão), com dano reduzido.
- A faca causa mais dano **pelas costas** (a facada forte pelas costas mata na hora).

### Pacotes de som

O dono da sala escolhe em **Regras da partida → Sons** (ou em Configurações → Partida). Todo mundo na sala ouve o mesmo pacote:

| Pacote | O que toca |
|---|---|
| **Padrão** | Sons gerados pelo próprio jogo |
| **Profissional** | Gravações reais de armas (CC0, créditos em `public/sounds/profissional/CREDITOS.txt`) |
| **Zoeira** | Sons gravados pela galera |

Para gravar a zoeira, abra **http://localhost:3000/gravar.html** no computador que roda o servidor (o navegador só libera o microfone em `localhost`). Cada som do jogo tem um botão **● Gravar**: grave, ouça, salve. Quem estiver em outro computador pode mandar um arquivo gravado no celular pelo botão **📁 Arquivo**. Som que ninguém gravou toca o padrão. Se o `config.json` tiver `adminPassword`, a página pede essa senha para gravar ou apagar; para desligar a gravação, use `"soundUploads": false`.

---

## 5. Armas

| Arma | Modelo real | Dano | Cadência | Pente | Observações |
|---|---|---|---|---|---|
| **AK-47** | Kalashnikov · 7,62×39 mm | 36 | 600 rpm | 30 | headshot mata mesmo com capacete; recuo forte |
| **M4A1** | Colt · 5,56 mm NATO | 33 | 666 rpm | 30 | mais controlável que a AK |
| **AUG** | Steyr AUG A1 · 5,56 mm | 28 | 666 rpm | 30 | luneta 1,5×, ótima penetração de colete |
| **AWP** | Accuracy International AWM · .338 Lapua | 115 | 41 rpm | 5 | mata com um tiro no tronco; lenta e imprecisa sem luneta |
| **SSG 08** | Steyr SSG 08 · .308 | 88 | 48 rpm | 10 | leve, precisa até no ar com luneta |
| **P90** | FN P90 · 5,7×28 mm | 26 | 857 rpm | 50 | ótima para atirar correndo |
| **MP5-SD** | H&K MP5SD · 9 mm | 27 | 750 rpm | 30 | silenciosa (não aparece no radar) |
| **UMP-45** | H&K UMP45 · .45 ACP | 35 | 666 rpm | 25 | dano alto, cai com a distância |
| **XM1014** | Benelli M4 · calibre 12 | 6×20 | 171 rpm | 7 | escopeta semiautomática, recarga cartucho a cartucho |
| **Glock-18** | Glock 18 · 9 mm | 30 | 400 rpm | 20 | pistola inicial |
| **USP-S** | H&K USP Tactical · .45 ACP | 35 | 352 rpm | 12 | silenciosa e precisa |
| **Desert Eagle** | Magnum Research · .50 AE | 63 | 267 rpm | 7 | headshot mata; recuo enorme |
| **Five-seveN** | FN Five-seveN · 5,7×28 mm | 32 | 400 rpm | 20 | atravessa bem o colete |

Cada arma tem um padrão de recuo próprio (a AK sobe e depois puxa para os lados, como o "7" do CS). A precisão piora correndo e no ar e melhora agachado. Parar antes de atirar (*counter-strafe*) faz diferença.

**Granadas** (quantidade por vida configurável):
- **Explosiva (M67):** até 98 de dano, reduzido pelo colete.
- **Luz (M84):** cega conforme o ângulo e a distância, com zumbido no ouvido.
- **Fumaça (M18):** bloqueia a visão por 18 s, inclusive nomes e radar.
- Botão esquerdo arremessa longe; botão direito, perto.

**Mina terrestre** (quantidade por vida configurável, padrão 1; tecla **7**):
- O botão esquerdo planta a mina no chão, logo à sua frente. Ela leva **1,5 s para armar** (o LED pisca rápido) e depois pisca a cada 1,2 s.
- Explode quando um inimigo pisa perto dela (cerca de 1,25 m). Antes, faz um "clique": dá para ouvir, mas não dá para fugir. Quem pisa em cima morre, mesmo de colete; o dano cai com a distância (raio de 6 m).
- O dono não dispara a própria mina, e os aliados também não (sem fogo amigo). Mas a explosão fere o dono se ele estiver perto.
- O LED é **verde** nas suas minas e nas dos aliados, e **vermelho** nas dos inimigos. As suas aparecem no radar.
- Dá para destruir uma mina **atirando nela** (de perto ou de longe) ou com uma **granada explosiva** a até cerca de 5 m. Quem atira leva o crédito pelos abates da explosão. Minas próximas explodem em cadeia.
- Cada jogador pode ter até 2 minas no mapa (a mais antiga some), e elas se desfazem sozinhas depois de 2 minutos. Não existem no Gun Game.

### Sons reais das armas (opcional)
O jogo gera os sons sozinho, mas você pode usar gravações reais: coloque arquivos `.ogg`, `.mp3` ou `.wav` na pasta `public/sounds/` com o nome da arma (`ak47.ogg`, `awp.wav`, `deagle_1.ogg`, `deagle_2.ogg`...). Também valem `explosion` (granada) e `mine` (mina). Basta recarregar a página. As instruções e sugestões de bancos de sons com licença livre (CC0) estão em `public/sounds/LEIA-ME.txt`.

---

## 6. Configurações

### Dentro do jogo (anfitrião): ESC › Configurar partida
Modo de jogo, mapa, fim da partida, tempo, limite de abates (individual e de equipe), fogo amigo, critério de desempate, tempo de renascimento, proteção ao renascer, onde renascer, vida por abate, recarga por abate, bônus de sequência, colete e capacete, munição infinita, número de granadas e de minas, modo "só tiro na cabeça", dano da própria granada, tempo do placar final, bots e dificuldade.

### Opções de cada jogador: ESC › Opções
- **Jogo:** sensibilidade (mesma escala do CS), sensibilidade com luneta, inverter Y, entrada bruta do mouse, campo de visão, pular com a roda do mouse, pulo automático (segurar espaço), números de dano, **identificação de jogadores** (aliados e inimigos em cores, ou só aliados como no modo clássico), FPS e ping.
- **Teclas:** todas as teclas podem ser trocadas.
- **Mira:** estilo (cruz, ponto, círculo), cor, tamanho, espessura, espaço central, contorno, ponto central, opacidade, estilo T, mira dinâmica e mira que acompanha o recuo, com prévia ao vivo e predefinições.
- **Vídeo:** qualidade (Baixa, Média, Alta, Ultra), escala de resolução, FOV e posição da arma, arma na mão esquerda e balanço ao andar.
- **Áudio:** volumes e áudio 3D avançado (HRTF) para fones.

As opções ficam salvas no navegador de cada jogador.

### Arquivo `config.json` (servidor)
Edite com o Bloco de Notas e reinicie o servidor:

| Campo | Para que serve |
|---|---|
| `port` | porta do servidor (padrão 3000). Também dá para usar `node server/index.js 4000` |
| `serverName` | nome que aparece para os jogadores |
| `maxPlayers` | máximo de jogadores (bots saem para abrir vaga) |
| `adminPassword` | se preenchida, qualquer um vira anfitrião digitando `/admin senha` no chat |
| `warmupTime` | (não é mais usado: a partida começa pela sala de espera) |
| `snapshotRate` | atualizações por segundo enviadas aos jogadores (32 é o recomendado) |
| `match` | regras iniciais da partida (as mesmas do menu do anfitrião). Em `"map"` use `"sertao"`, `"porto"`, `"galpao"` ou `"bunker"`; em `"mode"` use `"ffa"`, `"tdm"`, `"gungame"` ou `"ctf"` (capturas para vencer: `"captureLimit"`) |

### Chat
- **Y** ou **Enter** abre o chat para todos; **U** abre o chat da equipe (no mata-mata em equipe). Com o chat aberto, **Tab** alterna entre todos e equipe.
- O chat aberto mostra as últimas 100 mensagens com rolagem e uma barra de **emojis** para clicar. Atalhos digitados também viram emoji: `:)` `:D` `:(` `;)` `:P` `<3` `xD` `:fogo:` `:caveira:` `:joia:` `:rir:` `:gg:` `:alvo:`.
- **Rádio:** Z (comandos), X (respostas) ou C (geral) abre um menu; aperte de 1 a 6 para enviar ("Vamos, vamos, vamos!", "Inimigo avistado!", "Área limpa!"...). Em equipe, só os aliados recebem, e a sua posição pisca no radar deles. Se a tecla do rádio estiver sendo usada por outra ação (por exemplo, agachar no C), o rádio não a "rouba"; troque em Opções › Teclas.
- Mensagens de quem está morto aparecem com *\*MORTO\**; mensagens de equipe com *(EQUIPE)*.
- **Silenciar:** ESC mostra a lista de jogadores para silenciar com um clique, ou digite `/mute nome` (e `/unmute nome`). Vale só para você. `/limpar` apaga o seu histórico.
- Há um limite contra spam (6 mensagens a cada 4 segundos).

### Comandos de chat (anfitrião)
`/bots N` · `/kick nome` · `/start` (inicia, se todos estiverem prontos) · `/sala` (volta todos para a sala) · `/admin senha` · `/ajuda`

---

## 7. Desempenho

- A iluminação das salas é calculada uma vez ao carregar o mapa (menos de 1 segundo); durante o jogo ela não custa nada. Grama, entulho e papéis só aparecem nas qualidades Média, Alta e Ultra.

- O jogo é leve: os gráficos usam poucas chamadas de desenho e o servidor roda tranquilo num PC comum.
- Em notebooks com vídeo integrado, use a qualidade **Baixa** ou **Média** e reduza a **escala de resolução** em Opções › Vídeo.
- Confira se a **aceleração de hardware** do navegador está ativada (Chrome: Configurações › Sistema).
- Cabo de rede é melhor que Wi-Fi, mas Wi-Fi funciona bem na mesma casa.

---

## 8. Solução de problemas

| Problema | Solução |
|---|---|
| A janela do servidor abre e fecha / dá erro | Extraia o .zip antes ("Extrair tudo...") e rode o `iniciar-servidor.bat` de dentro da pasta extraída; confira se o Node.js está instalado |
| Fica em "Carregando..." ou tela branca | Não abra o `index.html` direto: com o servidor aberto, use `http://localhost:3000` no Chrome ou Edge |
| Amigos não conseguem abrir o endereço | Confira se estão na mesma rede, libere o firewall (seção 2) e use o IP mostrado no servidor, não `localhost` |
| A porta 3000 já está em uso | O servidor tenta sozinho 3001, 3002... Use o endereço que aparecer na janela |
| Tela preta / erro de WebGL | Atualize o navegador e o driver de vídeo e ative a aceleração de hardware |
| O mouse não fica preso na tela | Clique na tela do jogo (aparece "Clique para continuar") |
| Ctrl+W fechou a aba | Use a tela cheia (Chrome/Edge) ou troque o agachar para C |
| Jogo lento | Diminua a qualidade e a escala de resolução em Opções › Vídeo |

---

## 9. Estrutura do projeto (para quem quiser mexer)

```
sertao-strike/
├── server/          servidor (Node.js + WebSocket)
│   ├── index.js     HTTP + WebSocket + endereços da rede
│   ├── game.js      partida, tiros (com compensação de latência), dano, granadas, placar
│   ├── bots.js      inteligência dos bots
│   └── nav.js       navegação (A*) dos bots
├── shared/          código usado pelo servidor e pelo navegador
│   ├── constants.js regras, físicas e configurações padrão
│   ├── weapons.js   estatísticas das armas e padrões de recuo
│   ├── combat.js    dispersão, dano, colete e penetração
│   ├── physics.js   movimento estilo CS, colisões, hitboxes, granadas
│   └── maps.js      mapas Vila Sertão, Porto Delta, Galpão 7 e Bunker 13 (os três últimos são desenhados em grades de texto)
├── public/          jogo no navegador (Three.js)
│   ├── index.html, css/, lib/three.js
│   └── js/          renderização, armas em 1ª pessoa, efeitos, sons, HUD, menus,
│                    chat.js (chat e rádio), lighting.js (luz pré-calculada), decor.js (placas, fios, grama, entulho)
├── config.json      configurações do servidor
└── node_modules/ws  única dependência (já incluída)
```

- O servidor é **autoritativo** para tiros, dano, mortes, granadas e placar. A detecção de acerto "volta no tempo" até o momento que o atirador estava vendo, para compensar a interpolação na rede.
- Para adicionar armas, edite `shared/weapons.js` (e o modelo em `public/js/models.js`). Para novos mapas, use `shared/maps.js`: o jeito mais fácil é copiar `buildGalpao` e redesenhar a grade (`#` parede, `.` piso descoberto, `,` piso coberto, `l` janela) e a lista de objetos.

Licença MIT. Usa [three.js](https://threejs.org) (MIT) e [ws](https://github.com/websockets/ws) (MIT).
