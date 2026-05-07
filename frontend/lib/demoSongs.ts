export interface DemoSong {
  id: string;
  title: string;
  composer: string;
  /** Bucket for grouping in the picker UI */
  category: "folk" | "classical" | "jazz";
  abc: string;
}

/**
 * 15 public-domain pieces. All ABC notation is hand-tuned to be syntactically
 * valid for abcjs (versioning declared via X:n header).
 */
export const DEMO_SONGS: DemoSong[] = [
  // ─── Folk / Traditional ─────────────────────────────────────────────────
  {
    id: "twinkle",
    title: "Twinkle Twinkle Little Star",
    composer: "Traditional",
    category: "folk",
    abc: `X:1
T:Twinkle Twinkle Little Star
C:Traditional
M:4/4
L:1/4
Q:1/4=120
K:C
C C G G | A A G2 | F F E E | D D C2 |
G G F F | E E D2 | G G F F | E E D2 |
C C G G | A A G2 | F F E E | D D C2 |`,
  },
  {
    id: "birthday",
    title: "Happy Birthday",
    composer: "Traditional",
    category: "folk",
    abc: `X:2
T:Happy Birthday
C:Traditional
M:3/4
L:1/4
Q:1/4=100
K:G
D/2D/2 | E D G | F3 | D/2D/2 E D | A G3 |
D/2D/2 d B | G F E | c/2c/2 B G | A G2 |]`,
  },
  {
    id: "amazing-grace",
    title: "Amazing Grace",
    composer: "Traditional",
    category: "folk",
    abc: `X:3
T:Amazing Grace
C:Traditional
M:3/4
L:1/4
Q:1/4=80
K:G
D | G2 B/G/ | B2 A | G2 E | D3 |
D | G2 B/G/ | B2 A | d3 | d3 |
B | d2 B/d/ | B2 G | E2 D | E3 |
D | G2 B/G/ | B2 A | G3 | G3 |]`,
  },
  {
    id: "scarborough",
    title: "Scarborough Fair",
    composer: "Traditional English",
    category: "folk",
    abc: `X:4
T:Scarborough Fair
C:Traditional
M:3/4
L:1/4
Q:1/4=90
K:Am
A | e2 e | e d B | A G A | B3 |
A G A | B2 c | d c B | A3 |
e d c | B2 A | G F G | A3 |
A G A | B2 c | A3 | A3 |]`,
  },
  {
    id: "greensleeves",
    title: "Greensleeves",
    composer: "Traditional English",
    category: "folk",
    abc: `X:5
T:Greensleeves
C:Traditional
M:6/8
L:1/8
Q:3/8=80
K:Am
A | c3 e2 f | g3 f2 e | d3 B2 G | A3 ^G2 A |
c3 e2 f | g3 f2 e | d2 B G2 ^F | E3 E3 |]`,
  },
  {
    id: "drunken-sailor",
    title: "Drunken Sailor",
    composer: "Traditional Sea Shanty",
    category: "folk",
    abc: `X:6
T:Drunken Sailor
C:Traditional
M:4/4
L:1/8
Q:1/4=120
K:Dm
|: D D D F A2 A2 | A B A G F2 D2 | F F F A d2 d2 | d c B A G2 F2 :|
|: A2 d c B2 A G | F2 D F A2 d2 | A2 d c B2 A G | F2 D F D4 :|`,
  },
  {
    id: "auld-lang-syne",
    title: "Auld Lang Syne",
    composer: "Robert Burns / Traditional Scots",
    category: "folk",
    abc: `X:7
T:Auld Lang Syne
C:Robert Burns
M:4/4
L:1/4
Q:1/4=90
K:F
F | F F A G | F G A2 | F F A B | c2 c2 |
d d c A | A G F G | F F A B | c2 F2 |]`,
  },

  // ─── Classical ──────────────────────────────────────────────────────────
  {
    id: "ode",
    title: "Ode to Joy",
    composer: "Beethoven",
    category: "classical",
    abc: `X:8
T:Ode to Joy
C:L. van Beethoven
M:4/4
L:1/4
Q:1/4=120
K:C
E E F G | G F E D | C C D E | E3/2 D/ D2 |
E E F G | G F E D | C C D E | D3/2 C/ C2 |
D D E C | D E/2F/2 E C | D E/2F/2 E D | C D G2 |
E E F G | G F E D | C C D E | D3/2 C/ C2 |`,
  },
  {
    id: "elise",
    title: "Für Elise",
    composer: "Beethoven",
    category: "classical",
    abc: `X:9
T:Fur Elise
C:L. van Beethoven
M:3/8
L:1/16
Q:3/8=54
K:Am
e2^d2 e2^d2 e2 B2 d2 c2 | A6 z2 A,2 C2 E2 | A4 B4 z2 E2 G2 |
B4 c4 z2 e2 ^d2 | e2^d2 e2^d2 e2 B2 d2 c2 | A6 z2 A,2 C2 E2 |
A4 B4 z2 E2 c2 | B6 z6 |]`,
  },
  {
    id: "canon",
    title: "Canon in D",
    composer: "Pachelbel",
    category: "classical",
    abc: `X:10
T:Canon in D
C:J. Pachelbel
M:4/4
L:1/8
Q:1/4=72
K:D
|: d2 A2 B2 f2 | g2 d2 g2 a2 | f2 A2 d2 e2 | f2 e2 f2 g2 |
f2 d2 A2 d2 | B2 d2 e2 f2 | g2 f2 e2 f2 | d4 A4 :|`,
  },
  {
    id: "minuet-g",
    title: "Minuet in G",
    composer: "J.S. Bach (attr.)",
    category: "classical",
    abc: `X:11
T:Minuet in G
C:J.S. Bach
M:3/4
L:1/8
Q:1/4=110
K:G
|: d2 G2 A2 | B2 G2 A2 | B2 c2 d2 | g2 f2 e2 |
d4 c2 | B2 c2 d2 | A4 c2 | B6 :|`,
  },
  {
    id: "eine-kleine",
    title: "Eine kleine Nachtmusik (theme)",
    composer: "Mozart",
    category: "classical",
    abc: `X:12
T:Eine kleine Nachtmusik
C:W.A. Mozart
M:4/4
L:1/8
Q:1/4=140
K:G
|: G4 d4 | G2 d2 g2 d2 | g a/2g/2 f/2e/2 d2 c2 | B4 G4 :|
|: A4 ^G/2A/2 B/2A/2 | A2 ^G/2A/2 B/2A/2 c4 | B4 A/2G/2 ^F/2G/2 | A6 z2 :|`,
  },

  // ─── Jazz / Standards (head melody only, public domain or pre-1929) ─────
  {
    id: "when-saints",
    title: "When the Saints Go Marching In",
    composer: "Traditional Spiritual",
    category: "jazz",
    abc: `X:13
T:When the Saints Go Marching In
C:Traditional
M:4/4
L:1/4
Q:1/4=130
K:F
F | A B c2 | F A B c | A F A G | F4 |
A B c2 | F A B c | A F G F | C4 |]`,
  },
  {
    id: "swing-low",
    title: "Swing Low, Sweet Chariot",
    composer: "Traditional Spiritual",
    category: "jazz",
    abc: `X:14
T:Swing Low Sweet Chariot
C:Traditional
M:4/4
L:1/4
Q:1/4=80
K:G
G | G B d B | G3 d/B/ | A G E G | D4 |
G B d B | G3 d/B/ | A G E G | G4 |]`,
  },
  {
    id: "frere-jacques",
    title: "Frère Jacques",
    composer: "Traditional French",
    category: "folk",
    abc: `X:15
T:Frere Jacques
C:Traditional
M:4/4
L:1/4
Q:1/4=120
K:C
C D E C | C D E C | E F G2 | E F G2 |
G/2A/2 G/2F/2 E C | G/2A/2 G/2F/2 E C | C G, C2 | C G, C2 |]`,
  },
];
