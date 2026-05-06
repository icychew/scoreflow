export interface DemoSong {
  id: string;
  title: string;
  composer: string;
  abc: string;
}

export const DEMO_SONGS: DemoSong[] = [
  {
    id: "twinkle",
    title: "Twinkle Twinkle Little Star",
    composer: "Traditional",
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
    id: "ode",
    title: "Ode to Joy",
    composer: "Beethoven",
    abc: `X:2
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
    id: "birthday",
    title: "Happy Birthday",
    composer: "Traditional",
    abc: `X:3
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
    id: "canon",
    title: "Canon in D",
    composer: "Pachelbel",
    abc: `X:4
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
    id: "elise",
    title: "Für Elise",
    composer: "Beethoven",
    abc: `X:5
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
];
