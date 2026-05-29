# Spritesheet / Frame Loop README

Tento projekt nepouziva klasicky atlas spritesheetu pro nepratele, ale sekvenci samostatnych PNG snimku, ktere se prehravaji jako loop.

## Jak funguje animacni smycka

- Animace je urcena primarne pro `Enemy`.
- Engine prehrava frame sekvenci v nekonecne smycce.
- Vychozi nastaveni:
  - `spriteAnimationEnabled: true`
  - `spriteAnimationFrames: 5`
  - `spriteAnimationStart: 1`
  - `spriteAnimationFps: 12`
  - `spriteAnimationPadding: 5`
  - `spriteAnimationExt: "png"`
- To znamena, ze se nacitaji soubory:
  - `00001.png`
  - `00002.png`
  - `00003.png`
  - `00004.png`
  - `00005.png`
- Po `00005.png` se animace plynule vraci zpet na `00001.png`.

## Kde maji byt soubory

Priklad pro nepratele:

```text
src/
  Enemy/
    Enemy_01/
      00001.png
      00002.png
      00003.png
      00004.png
      00005.png
      enemy_01.json
```

Poznamky:

- Slozka varianty odpovida slotu, napr. `Enemy_01`, `Enemy_02`, `Enemy_03`.
- JSON preset urcuje, kolik snimku se prehrava a odkud se berou.
- Pokud chybi specialni subfolder, engine umi pouzit i fallback bez subfolderu, ale doporucene je drzet strukturu se slozkou varianty.

## Co musi byt konzistentni ve vsech framech

Kazdy frame musi mit:

- stejnou sirku a vysku
- stejny crop
- stejnou kameru
- stejny zoom
- stejny pivot tela
- stejny smer kompozice
- stejny pruhledny okraj

Jinak bude sprite pri prehravani "poskakovat".

## Dulezite pravidlo pro generovani v ChatGPT

Cilem neni udelat 5 ruznych obrazku, ale 5 po sobe jdoucich fazi jedne kratke loop animace.

ChatGPT nebo jiny generator musi dostat zadani, ze:

- frame 1 a frame 5 na sebe musi navazovat
- zmena mezi framy ma byt mala
- silueta se nema rozpadat
- sprite se nema otacet skokove
- telo nema menit meritko mezi snimky
- pozadi ma byt transparentni

## Doporuceny typ animace

Pro tenhle projekt funguji nejlip:

- jemne dychani / pulzovani
- lehke organicke chveni
- drobne vlneni okraje
- jemny posun vnitrnich detailu
- mikro-pohyb cytoplazmy / jadra / oralni casti

Naopak se nehodi:

- velke skoky mezi framy
- dramaticke rotace
- velke zmeny siluety
- zmena uhlu pohledu
- zmena velikosti canvasu

## Presny prompt pro ChatGPT

Pouzij klidne tenhle template:

```text
Vytvor 5-frame seamless sprite animation loop pro 2D game enemy organism.

Technicke pozadavky:
- vystup je 5 samostatnych PNG framu
- nazvy: 00001.png az 00005.png
- vsechny framy musi mit naprosto stejnou velikost canvasu
- transparentni pozadi
- stejny framing, stejny zoom, stejny pivot
- frame 5 musi plynule navazovat na frame 1
- mezi framy jen jemna organicka zmena, ne skok
- zachovat stejny celkovy tvar a siluetu
- zadny text, zadne UI, zadne pozadi

Vizuani styl:
- mikroskopicky biologicky organismus
- cisty game-ready sprite
- citelna silueta
- jemna organicka idle animace

Cil:
Vysledna animace se musi dat prehravat v nekonecne smycce pri 12 FPS bez viditelneho skoku.
```

## Doporuceny workflow

1. Nechat vygenerovat referencni frame 1.
2. Nechat z nej odvodit frame 2 az 5 jako jemne faze jedne smycky.
3. Zkontrolovat, ze vsechny PNG maji stejne rozmery.
4. Ulozit je jako `00001.png` az `00005.png`.
5. Vlozit je do spravne slozky varianty, napr. `src/Enemy/Enemy_01/`.
6. Otestovat loop pri 12 FPS.

## Poznamka k ostatnim entitam

- `ComposedStone` aktualne pouziva staticky sprite, ne frame sekvenci.
- Tenhle README je hlavne pro generovani animovanych enemy framu.
