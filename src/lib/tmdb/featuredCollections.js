// Colecciones de TMDb del índice de /lists (pestaña Colecciones): la selección
// de sagas conocidas y el formato con el que se envía cada una al cliente (lo
// usa /api/tmdb/collections/featured).

// FILTRO: solo sagas CONOCIDAS, elegidas a mano y, además, con al menos
// FEATURED_MIN_VOTES votos en TMDb entre todas sus películas (una medida estable
// de lo conocida que es; la popularidad de TMDb fluctúa a diario). El umbral es
// un suelo, no el criterio: por encima hay colecciones que no se incluyen
// (películas sueltas con una secuela desconocida o sin estrenar, nichos). Lo
// comprueba featuredCollections.test.mjs contra
// src/data/tmdbCollectionsCatalog.json, así que una saga desconocida no puede
// colarse al ampliar la lista.
export const FEATURED_MIN_VOTES = 7_000;

export const FEATURED_COLLECTION_IDS = [
  // Top Populares
  10, // Star Wars
  1241, // Harry Potter
  119, // The Lord of the Rings
  121938, // The Hobbit (antes 535313, que es Godzilla)
  86311, // The Avengers
  9485, // Fast & Furious
  645, // James Bond
  295, // Pirates of the Caribbean
  84, // Indiana Jones
  87096, // Avatar

  // Fantasía y aventura
  435259, // Fantastic Beasts
  420, // The Chronicles of Narnia
  33514, // The Twilight Saga
  495527, // Jumanji
  1733, // The Mummy
  261307, // Alice in Wonderland
  531331, // Maleficent
  85943, // Night at the Museum
  295130, // The Maze Runner
  283579, // Divergent
  179919, // Percy Jackson
  86780, // Clash of the Titans
  52984, // National Treasure
  2467, // Lara Croft: Tomb Raider
  1216426, // Uncharted
  1657, // The Mask of Zorro
  17235, // Hellboy

  // Marvel
  556, // Spider-Man
  531241, // Spider-Man (MCU)
  125574, // The Amazing Spider-Man
  573436, // Spider-Verse
  131292, // Iron Man
  131295, // Captain America
  131296, // Thor
  284433, // Guardians of the Galaxy
  422834, // Ant-Man
  618529, // Doctor Strange
  623911, // Captain Marvel
  9744, // Fantastic Four (2005)
  735, // Blade
  529892, // Black Panther
  748, // X-Men
  453993, // Wolverine
  448150, // Deadpool
  558216, // Venom
  90306, // Ghost Rider

  // DC
  263, // The Dark Knight
  120794, // Batman (1989-1997)
  8537, // Superman
  209131, // Man of Steel
  468552, // Wonder Woman
  531242, // Suicide Squad
  573693, // Aquaman
  987044, // Joker
  724848, // Shazam!
  1025281, // Constantine

  // Acción
  87359, // Mission: Impossible
  404609, // John Wick
  2344, // The Matrix
  8650, // Transformers
  328, // Jurassic Park
  528, // Terminator
  31562, // Bourne
  1570, // Die Hard
  304, // Ocean's
  391860, // Kingsman
  135483, // Taken
  523855, // The Equalizer
  126125, // The Expendables
  1069584, // Gladiator
  531330, // Top Gun
  945, // Lethal Weapon
  14890, // Bad Boys
  52785, // xXx
  125570, // 300
  386534, // Olympus Has Fallen
  179892, // Kick-Ass
  8580, // The Karate Kid
  9518, // The Transporter
  403374, // Jack Reacher
  135179, // Sin City
  163902, // RED
  85861, // Beverly Hills Cop
  1129084, // Nobody
  70068, // Ip Man
  135468, // G.I. Joe
  401562, // Teenage Mutant Ninja Turtles
  742536, // The Meg
  735127, // Extraction
  870339, // The Accountant
  43064, // Speed
  192492, // Jack Ryan
  10456, // Dirty Harry
  64751, // Crank
  737031, // Hitman
  86029, // Charlie's Angels

  // Animación
  10194, // Toy Story
  86066, // Despicable Me
  544669, // Minions
  8354, // Ice Age
  2150, // Shrek
  14740, // Madagascar
  89137, // How to Train Your Dragon
  77816, // Kung Fu Panda
  137697, // Finding Nemo
  468222, // The Incredibles
  137696, // Monsters, Inc.
  87118, // Cars
  386382, // Frozen
  1022790, // Inside Out
  185103, // Hotel Transylvania
  1084247, // Zootopia
  94032, // The Lion King
  1451578, // Coco
  404825, // Wreck-It Ralph
  1241984, // Moana
  86027, // Aladdin
  720879, // Sonic
  94602, // Puss in Boots
  544670, // Sing
  167613, // Alvin and the Chipmunks
  427084, // The Secret Life of Pets
  464577, // The Croods
  325470, // The LEGO Movie
  229932, // Rio
  722961, // Space Jam
  97461, // Lilo & Stitch
  519457, // The Boss Baby
  177467, // Cloudy with a Chance of Meatballs
  762512, // The Lion King (2019)
  87236, // Mulan
  153010, // Beauty and the Beast
  33085, // The Little Mermaid
  55419, // Cinderella
  1268789, // Tangled
  275402, // SpongeBob
  489724, // Trolls
  100693, // 101 Dalmatians
  97459, // The Jungle Book
  488924, // Paddington

  // Terror
  313086, // The Conjuring
  91361, // Halloween
  656, // Saw
  2602, // Scream
  477962, // It
  8864, // Final Destination
  228446, // Insidious
  402074, // Annabelle
  521226, // A Quiet Place
  256322, // The Purge
  9735, // Friday the 13th
  8581, // A Nightmare on Elm Street
  41437, // Paranormal Activity
  10455, // Child's Play
  530064, // The Shining
  2326, // Underworld
  1565, // 28 Days Later
  537982, // Zombieland
  2366, // Jaws
  12263, // The Exorcist
  119674, // Psycho
  1960, // Evil Dead
  14563, // The Ring
  111751, // The Texas Chainsaw Massacre
  619537, // Train to Busan
  748919, // Don't Breathe
  526380, // Happy Death Day
  74508, // [REC]
  479888, // The Thing
  89151, // Gremlins
  968052, // The Nun
  64750, // The Blair Witch Project
  357173, // Sinister
  8917, // Hellraiser
  760193, // Orphan
  64748, // Silent Hill
  86578, // Hostel
  10924, // From Dusk Till Dawn

  // Ciencia Ficción
  8091, // Alien
  264, // Back to the Future
  131635, // The Hunger Games
  8945, // Mad Max
  173710, // Planet of the Apes (reboot)
  86055, // Men in Black
  399, // Predator
  422837, // Blade Runner
  115575, // Star Trek (Kelvin)
  726871, // Dune
  1539140, // MonsterVerse (Godzilla x Kong)
  363369, // Pacific Rim
  17255, // Resident Evil
  135416, // Prometheus
  304378, // Independence Day
  535313, // Godzilla (Legendary)
  2794, // The Chronicles of Riddick
  4438, // 2001: A Space Odyssey
  63043, // TRON
  151, // Star Trek (The Original Series)
  5547, // RoboCop
  1709, // Planet of the Apes (1968)
  10522, // Starship Troopers
  115762, // Alien vs. Predator

  // Comedia
  86119, // The Hangover
  2806, // American Pie
  9888, // Home Alone
  4246, // Scary Movie
  2980, // Ghostbusters
  51509, // Meet the Parents
  90863, // Rush Hour
  266672, // Ted
  212562, // 21 Jump Street
  124949, // Bruce Almighty
  306031, // Pitch Perfect
  43072, // The Mask
  8936, // Bridget Jones
  37139, // The Naked Gun
  180546, // Grown Ups
  3167, // Ace Ventura
  1006, // Austin Powers
  99606, // Mean Girls
  9338, // Police Academy
  86117, // Johnny English
  400700, // Neighbors
  96665, // Dumb and Dumber
  280588, // Horrible Bosses
  2396, // Asterix & Obelix
  945475, // Beetlejuice
  747168, // Borat
  352789, // Zoolander
  93791, // Anchorman
  11716, // The Addams Family
  86860, // Scooby-Doo
  17178, // Jackass

  // Drama y suspense
  230, // The Godfather
  1575, // Rocky (antes 553, que no existe)
  553717, // Creed
  5039, // Rambo
  9743, // Hannibal Lecter
  115776, // Robert Langdon
  722971, // Knives Out
  382685, // Now You See Me
  102322, // Sherlock Holmes
  2883, // Kill Bill
  735384, // Hercule Poirot
  344830, // Fifty Shades
  424202, // Trainspotting
  496796, // Sicario
  123800, // Before Trilogy
  829314, // Enola Holmes

  // Musicales
  458558, // Mamma Mia!
  87253, // High School Musical
  86083, // Grease
  527439, // Mary Poppins

  // Anime
  425164, // Dragon Ball Z (películas)
  23616, // Naruto
];

/** Nombre del índice: sin « - Colección» / « Collection» (la ficha lo lleva). */
export function cleanCollectionName(name) {
  return String(name || "Colección")
    .replace(/ Collection$/i, "")
    .replace(/ - Colección$/i, "");
}

/** Resumen de una colección (respuesta de /collection/{id}) para el índice. */
export function toCollectionSummary(c) {
  const parts = Array.isArray(c?.parts) ? c.parts : [];
  return {
    source: "collection",
    id: String(c?.id),
    name: cleanCollectionName(c?.name),
    description: c?.overview || "",
    item_count: parts.length,
    poster_path: c?.poster_path || null,
    backdrop_path: c?.backdrop_path || null,
    tmdbUrl: c?.id ? `https://www.themoviedb.org/collection/${c.id}` : null,
  };
}
