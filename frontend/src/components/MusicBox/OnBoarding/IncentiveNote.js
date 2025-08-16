import React, { useState, useEffect, useContext } from "react";
import Box from "@mui/material/Box";
import Tab from "@mui/material/Tab";
import TabContext from "@mui/lab/TabContext";
import TabList from "@mui/lab/TabList";
import TabPanel from "@mui/lab/TabPanel";
import { getCookie } from "../../Security/TokensUtils";

// Styles
const styles = {
  button: {
    borderRadius: "20px",
    backgroundImage: "linear-gradient(to right, #fa9500, #fa4000)",
    color: "white",
    border: "none",
    textTransform: "none",
    "&:hover": {
      border: "none",
    },
  },
};

export default function IncentiveNote({
  setStage,
  searchSong,
  setSearchSong,
  boxInfo,
  setDispSong,
  setDepositedBy,
  setAchievements,
  setRevealedDeposit
}) {
  const [value, setValue] = useState("1");

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  function handleAddNoteButtonClick(note) {
    setSearchSong(currentSearchSong => {
      const updatedSearchSong = { ...currentSearchSong, note: note };
      return updatedSearchSong;
    });

    const csrftoken = getCookie("csrftoken");

    fetch('/box-management/create-deposit/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken,
      },
      body: JSON.stringify({
        option: { ...searchSong, note },
        box_id: boxInfo.box.id,
      }),
    })
      .then(response => response.json())
      .then(data => {
        const { new_deposit, last_deposit, song, achievements } = data;
        setRevealedDeposit(last_deposit);
        setDispSong(song);
        setDepositedBy(last_deposit.user);
        setAchievements(achievements);
        setStage(5);
      })
      .catch(error => {
        console.error(error);
      });
  }

  const Item = ({ note, sentence }) => (
    <div className="mood-item">
      <div className="mood-item__content">
        {sentence}
      </div>
      <button className="btn-tertiary" onClick={() => handleAddNoteButtonClick(note)}>
        <span>Attacher</span>
      </button>
    </div>
  );

  return (
    <div className="stage-3__wrapper">
      <div className="step-header">
        <h1>Attache un mot</h1>
        <p>Explique pourquoi tu as choisis cette chanson</p>
      </div>

      <div className="selected-song">
        <ul className="search-results">
          <li>
            <div className="img-container">
              <img
                src={searchSong.image_url}
                alt={searchSong.name}
              />
            </div>

            <div className="song">
              <p className="song-title" variant="h6">{searchSong.name}</p>
              <p className="song-subtitle" variant="subtitle2">{searchSong.artist}</p>
            </div>

            <button
              onClick={() => setStage(2)}
            >
              <span>Changer</span>
            </button>

          </li>
        </ul>
      </div>

      <div className="mood"
      >
        <TabContext value={value}>
          <Box>
            <TabList onChange={handleChange} variant="scrollable" aria-label="lab API tabs example">
              <Tab label="Moods" value="1" />
              <Tab label="Événements marquants" value="2" />
              <Tab label="Famille et amis" value="3" />
              <Tab label="Souvenirs et évasion" value="4" />
              <Tab label="Inspiration et liberté" value="5" />
              <Tab label="Réflexion et calme" value="6" />
            </TabList>
          </Box>

          <TabPanel value="1">
            <Item note="donnesourire" sentence="Cette chanson me donne toujours le sourire" />
            <Item note="momentdejoie" sentence="Cette chanson rappelle des moments de joie" />
            <Item note="souvenirfetes" sentence="Cette chanson évoque des souvenirs de fêtes" />
            <Item note="faitdanser" sentence="Cette chanson me fait toujours danser" />
            <Item note="remplitbonheur" sentence="Cette chanson me remplit de bonheur instantanément" />
            <Item note="remedejoursgris" sentence="Cette chanson est mon remède contre les jours gris" />
            <Item note="joursheureuxenfance" sentence="Cette chanson rappelle les jours heureux de mon enfance" />
            <Item note="explosionjoie" sentence="Cette chanson est une explosion de joie" />
            <Item note="accompagnenostalgie" sentence="Cette chanson m'accompagne quand je suis nostalgique" />
            <Item note="pleurerchaquefois" sentence="Cette chanson me fait pleurer à chaque fois" />
            <Item note="nuitsdete" sentence="Cette chanson rappelle les nuits d'été sous les étoiles" />
            <Item note="momentspasses" sentence="Cette chanson me fait revivre les moments passés" />
            <Item note="doucemelancolie" sentence="Cette chanson évoque une douce mélancolie" />
            <Item note="pleinenostalgie" sentence="Cette chanson est pleine de nostalgie" />
            <Item note="espoirsjeunesse" sentence="Cette chanson rappelle les rêves et espoirs de ma jeunesse" />
          </TabPanel>
          <TabPanel value="2">
            <Item note="periodedifficile" sentence="Cette chanson a été ma bande-son pendant une période difficile" />
            <Item note="traverserrupture" sentence="Cette chanson m'a aidé à traverser une rupture" />
            <Item note="ecouteaulycee" sentence="Cette chanson, je l'écoutais en boucle au lycée" />
            <Item note="defissurmontes" sentence="Cette chanson rappelle les défis que j'ai surmontés" />
            <Item note="momentcle" sentence="Cette chanson est liée à un moment clé de ma vie" />
            <Item note="reussitesexamens" sentence="Cette chanson rappelle des examens et réussites" />
            <Item note="tournantcarriere" sentence="Cette chanson a marqué un tournant dans ma carrière" />
            <Item note="momentscruciaux" sentence="Cette chanson était là lors des moments cruciaux" />
            <Item note="ecoleprimaire" sentence="Cette chanson me rappelle mes jours d'école primaire" />
            <Item note="souvenircollege" sentence="Cette chanson évoque les souvenirs du collège" />
            <Item note="souvenirlycee" sentence="Cette chanson était un hit pendant mes années de lycée" />
            <Item note="souveniruniversité" sentence="Cette chanson me rappelle mes années à l'université" />
            <Item note="naissanceenfant" sentence="Cette chanson est spéciale car je l'écoutais à la naissance de mon enfant" />
            <Item note="nuitsblanchesenfant" sentence="Cette chanson me rappelle les nuits blanches en tant que jeune parent" />
            <Item note="premieremploi" sentence="Cette chanson me ramène à mon premier emploi" />
            <Item note="souvenirmariage" sentence="Cette chanson évoque le jour de mon mariage" />
            <Item note="anneesdorees" sentence="Cette chanson m'accompagne dans mes années dorées" />
          </TabPanel>
          <TabPanel value="3">
            <Item note="souveniramies" sentence="Cette chanson me fait penser à mes ami·e·s" />
            <Item note="souvenirparents" sentence="Cette chanson me fait penser à mes parents" />
            <Item note="souvenirgrandsparents" sentence="Cette chanson me fait penser à mes grands-parents" />
            <Item note="souvenirfreresoeur" sentence="Cette chanson me fait penser à mon·mes frère/ma·mes sœurs" />
            <Item note="souvenircousin" sentence="Cette chanson me fait penser à mon·ma·mes mes cousin·e·s" />
            <Item note="souvenirenfants" sentence="Cette chanson me fait penser à mes enfants" />
            <Item note="souvenircollegues" sentence="Cette chanson me fait penser à mon·ma·mes collègue·s" />
            <Item note="souveniramisenfance" sentence="Cette chanson me fait penser à mes vieux amis d'enfance" />
          </TabPanel>
          <TabPanel value="4">
            <Item note="meilleuresvacances" sentence="Cette chanson me rappelle les meilleures vacances" />
            <Item note="eteplage" sentence="Cette chanson m’évoque les étés à la plage" />
            <Item note="souvenirenfance" sentence="Cette chanson rappelle mon enfance" />
            <Item note="roadtripinoubliable" sentence="Cette chanson, je l’ai découverte pendant un road trip inoubliable" />
            <Item note="couchersoleilplage" sentence="Cette chanson me fait penser aux couchers de soleil sur la plage" />
            <Item note="bandesonexploration" sentence="Cette chanson était la bande-son de nos explorations" />
            <Item note="hymneliberte" sentence="Cette chanson est un hymne à la liberté" />
            <Item note="evasion" sentence="Cette chanson m'aide à m'évader" />
            <Item note="accompagnevoyage" sentence="Cette chanson m'a accompagné en voyage" />
            <Item note="voler" sentence="Cette chanson me fait sentir comme si je volais" />
            <Item note="souvenirsfete" sentence="Cette chanson rappelle des fêtes inoubliables" />
            <Item note="invitationaventure" sentence="Cette chanson est une invitation à l'aventure" />
            <Item note="paysagemagnifiques" sentence="Cette chanson rappelle des paysages magnifiques" />
            <Item note="voyagelointain" sentence="Cette chanson, est un voyage lointain" />
          </TabPanel>
          <TabPanel value="5">
            <Item note="motivation" sentence="Cette chanson me motive quand j'en ai besoin" />
            <Item note="dansesansretenue" sentence="Cette chanson me donne envie de danser sans retenue" />
            <Item note="sentirpuissance" sentence="Cette chanson me fait me sentir puissant" />
            <Item note="boost" sentence="Cette chanson me booste quand il le faut" />
            <Item note="trouverenergie" sentence="Cette chanson m'aide à trouver de l'énergie" />
            <Item note="inspirationautop" sentence="Cette chanson m'inspire à être au top" />
            <Item note="crideguerre" sentence="Cette chanson est mon cri de guerre avant un défi" />
            <Item note="toutaccomplir" sentence="Cette chanson me rappelle que je peux tout accomplir" />
            <Item note="briserchaines" sentence="Cette chanson m'inspire à briser toutes les chaînes" />
            <Item note="rienimpossible" sentence="Cette chanson me fait sentir que rien n'est impossible" />
            <Item note="donneespoir" sentence="Cette chanson, les paroles me donnent de l'espoir" />
            <Item note="donnefrissons" sentence="Cette chanson me donne des frissons à chaque écoute" />
            <Item note="transporteailleurs" sentence="Cette chanson me transporte instantanément ailleurs" />
            <Item note="parolesresonne" sentence="Cette chanson, les paroles résonnent en moi" />
            <Item note="inspiremeilleur" sentence="Cette chanson m'inspire à être meilleur" />
            <Item note="toujoursespoir" sentence="Cette chanson rappelle qu'il y a toujours de l'espoir" />
          </TabPanel>
          <TabPanel value="6">
            <Item note="paroletoucher" sentence="Cette chanson, les paroles me touchent profondément" />
            <Item note="pourreflexion" sentence="Cette chanson est parfaite pour la réflexion" />
            <Item note="pourmediter" sentence="Cette chanson est idéale pour méditer" />
            <Item note="momentcalme" sentence="Cette chanson est toujours là pour mes moments de calme" />
            <Item note="pourrecentrer" sentence="Cette chanson m'apaise et me recentre" />
            <Item note="sereniteinterieur" sentence="Cette chanson m'aide à trouver la sérénité intérieure" />
            <Item note="pourcontemplation" sentence="Cette chanson est idéale pour la contemplation" />
            <Item note="accompagnesolitude" sentence="Cette chanson m'accompagne dans la solitude" />
            <Item note="reflechir" sentence="Cette chanson est mon refuge pour réfléchir" />
            <Item note="promenadetranquille" sentence="Cette chanson est parfaite pour une promenade tranquille" />
            <Item note="joursdepluie" sentence="Cette chanson est idéale pour les jours de pluie" />
            <Item note="pouryoga" sentence="Cette chanson m'accompagne lors de mes séances de yoga" />
            <Item note="bainrelaxant" sentence="Cette chanson est parfaite pour un bain relaxant" />
            <Item note="endormirpaisiblement" sentence="Cette chanson est idéale pour s'endormir paisiblement" />
            <Item note="longuejournee" sentence="Cette chanson m'aide à me détendre après une longue journée" />
            <Item note="lecturetranquille" sentence="Cette chanson m'accompagne pendant mes lectures tranquilles" />
            <Item note="pausedetentenature" sentence="Cette chanson est idéale pour une pause détente en pleine nature" />
            <Item note="regarderetoiles" sentence="Cette chanson est parfaite pour écouter en regardant les étoiles" />
          </TabPanel>        </TabContext>

        <div className="bottom-panel">
          <button variant="contained" onClick={() => handleAddNoteButtonClick("")}>
            <span>Continuer sans note</span>
          </button>
        </div>
      </div>
    </div>
  );
}

