# Madplan-kartotek

Et selvstændigt, afhængighedsfrit værktøj til at planlægge kalorielette dage: indsæt en opskrifts ingredienser, sæt et dagligt kalorie-mål, og få mængderne skaleret proportionalt til at ramme målet — fordelt over morgenmad, frokost og aftensmad.

## Brug

Åbn `madplan.html` direkte i en browser — ingen installation, build-trin eller server nødvendig. Al data (kartotek, dage, indkøbsliste) gemmes i browserens `localStorage`, så det er lokalt for den browser/enhed, du bruger.

### Sådan hoster du det på GitHub Pages
1. Læg alle filer (`madplan.html`, `manifest.json`, `service-worker.js`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `frida-data.json`) i roden af dette repo.
2. Gå til **Settings → Pages** i repoet.
3. Vælg branch `main` og mappe `/root`, og gem.
4. Siden er tilgængelig på `https://<brugernavn>.github.io/<repo>/madplan.html`.

## Sæt din egen CORS-proxy op (anbefalet, gratis, ~10 min)

"Hent"-knappen ved opskrifter bruger som udgangspunkt delte, gratis proxy-tjenester (AllOrigins, Codetabs) til at hente sider på tværs af domæner — de er upålidelige (ingen driftsgaranti, deles af hele internettet). Din egen Cloudflare Worker løser det: samme mekanisme, men kun til dig, markant mere stabil, og gratis (100.000 kald/dag, intet betalingskort krævet).

1. Gå til https://dash.cloudflare.com og opret en gratis konto.
2. I venstre menu: **Workers & Pages** → **Create** → **Create Worker**.
3. Giv den et navn, fx `madplan-proxy` → **Deploy** (den deployer først en standard "Hello World"-skabelon, det er fint).
4. Klik **Edit code**. Slet alt den eksisterende kode, og indsæt hele indholdet af `worker.js` (leveret sammen med appen).
5. Klik **Deploy** igen (øverst til højre).
6. Kopiér URL'en, Cloudflare viser dig — den ser ud som `https://madplan-proxy.dit-brugernavn.workers.dev`.
7. Åbn madplan-appen → fanen **Råvarer** → indsæt URL'en i feltet "Din egen proxy til Hent-knappen" → **Gem**.

Herefter bruger "Hent"-knappen din egen Worker først, med de delte proxyer som backup, hvis noget skulle gå galt.

## Sådan installerer du den som app på mobilen
Værktøjet er sat op som en PWA (Progressive Web App), så den kan installeres som en rigtig app-genvej — med eget ikon og uden browserens adressefelt.

**iPhone (Safari):**
1. Åbn linket til `madplan.html` i Safari (skal være hostet, fx via GitHub Pages — virker ikke fra en lokal fil).
2. Tryk på Del-ikonet (firkant med pil op).
3. Vælg **"Føj til hjemmeskærm"**.
4. Appen får sit eget ikon og åbner i fuldskærm uden Safari's browser-ramme.

**Android (Chrome):**
1. Åbn linket i Chrome.
2. Chrome viser typisk selv et "Installer app"-forslag — ellers: menu (⋮) → **"Installer app"** eller **"Føj til startskærm"**.

**Bemærk:** PWA-installation (og service worker'en, som giver offline-adgang) kræver at siden køres over **https** — det er automatisk opfyldt, når den er hostet på GitHub Pages. Åbnes filen lokalt fra din computer (`file://`), virker appen fint, men installations- og offline-funktionerne aktiveres ikke.

## Sådan virker skaleringen

1. Du sætter et **dagligt kalorie-mål** og en **fordeling** mellem morgenmad/frokost/aftensmad (standard 25/30/45 %).
2. For hvert måltid indsætter du ingredienslisten fra en opskrift (én linje pr. ingrediens, som den står i originalopskriften), samt fremgangsmåden.
3. Værktøjet parser hver linje med regex (mængde, enhed, navn), matcher navnet mod kartoteket, og beregner rettens samlede kalorier ved den mængde, opskriften oprindeligt angiver.
4. Alle ingredienser skaleres proportionalt (samme skaleringsfaktor for hele retten), så måltidets samlede kalorier rammer dets andel af dagens mål.
5. Indkøbslisten lægger alle skalerede ingredienser sammen på tværs af de dage, du har udfyldt.

## Kartoteket

Kartoteket er bygget på Frida-fødevaredatabasen (frida.fooddata.dk), DTU Fødevareinstituttet, version 6.1 — både de ca. 60 mest brugte råvarer, der er bagt direkte ind i `madplan.html`, og en fuld liste på 1.390 fødevarer i den separate fil `frida-data.json`, som hentes automatisk, når appen kører hostet (kræver http/https — virker ikke ved en lokal `file://`-åbning). Alt du selv retter eller tilføjer, markeres som "bruger" og gemmes permanent i din browser; det bliver ikke overskrevet af Frida-listen.

**Kildeangivelse:** Data for fødevarers næringsindhold er stillet til rådighed af DTU Fødevareinstituttet (frida.fooddata.dk), Fødevaredata (frida.fooddata.dk), version 6.1, Fødevareinstituttet, Danmarks Tekniske Universitet.

Værdier for kcal, protein, fedt, mættet fedt, kulhydrat, fibre og salt er alle pr. 100 g og hentet direkte fra Frida (kolonnerne "Energi (kcal)", "Protein", "Fedt", "Sum mættede fedtsyrer", "Tilgængelig kulhydrat", "Kostfibre" og "Salt deklaration"). Enkelte råvarer i den indbyggede liste (fx paprika som krydderi, tacokrydderi, hønsebouillonterning, rødløg) findes ikke i Frida i den form og bruger stadig tilnærmede standardværdier — ret dem gerne på Råvarer-fanen, hvis du kender de præcise tal.

## Begrænsninger

- Regex-parseren er heuristisk. Usædvanlige formuleringer ("1 knsp. friskkværnet sort peber, efter smag") matcher måske ikke perfekt — ingredienser der ikke genkendes, markeres med en rød "ikke matchet"-tag, og tæller ikke med i kalorieberegningen.
- Værktøjet kan ikke selv hente indhold fra andre hjemmesider (browserens CORS-politik forhindrer det) — ingredienslisten skal indsættes manuelt.
