import React from 'react';
// import './homepage.css';

const HomePage = () => {
  return (
    <>
      <div className="landing-header">
        <img src="media/homepage/icon/qr.svg" alt="" />
        <p>Scanne une boîte pour l'ouvrir</p>
      </div>
      <div className="homepage">
        <section className="hero">
          <div className="content">
            <h1>Les Boîtes à Groove</h1>
            <p>Points de partage de musique entre humains</p>
          </div>
        </section>
        <section className="mission">
          <p className="emoji">✨</p>
          <h2>Échange des pépites musicales avec les passant·e·s qui t'entourent</h2>
          <div className="flow">
            <h3>Comment ça marche ?</h3>
            <ol>
              <li className="step1"><p>Scanne le Qr code de la boite pour l'ouvrir</p></li>
              <li className="step2"><p>Confirme que tu es à coté de la boîte</p></li>
              <li className="step3"><p>Choisis la chanson que tu veux déposer</p></li>
              <li className="step4"><p>Attache une petite phrase à ta chanson</p></li>
              <li className="step5"><p>Écoute la chanson qui a été déposée par la personne précédente et découvre son petit mot</p></li>
            </ol>
          </div>
        </section>
        <section className="instagram">
          <h2>Suis l'avancée du projet sur Instagram !</h2>
          <a href="https://www.instagram.com/lesboitesagroove?igsh=ZmIzZTBybGFxMWUz&utm_source=qr">
            <img src="../../../media/homepage/icon/insta.svg" alt="" /> Notre Instagram
          </a>
        </section>
        <section className="support">
          <h2>Tu as vu une "boîte" en mauvais état ?</h2>
          <p>Merci de le notifier aux organisateurs du festival</p>
        </section>
        <section className="faq step" id="faq">
          <h2>Questions fréquentes</h2>
          <div className="topic">
            <div className="question">Est-ce qu'il me faut un compte ?</div>
            <div className="reponse"><strong>Non</strong>, aucun compte n'est nécessaire pour utiliser les Boîtes à Groove.</div>
          </div>
          <div className="topic">
            <div className="question">Est-ce que déposer une chanson est payant ?</div>
            <div className="reponse"><strong>Non</strong>, l'utilisation des Boîtes à Groove est totalement gratuite.</div>
          </div>
          <div className="topic">
            <div className="question">Est-ce que toutes les Boîtes à Groove ont la même chanson ?</div>
            <div className="reponse"><strong>Non</strong>, chaque boîte est unique et habrite 1 seule chanson à la fois.</div>
          </div>
          <div className="topic">
            <div className="question">Que va-t-il arriver à mes données ?</div>
            <div className="reponse"><strong>Rien</strong>, nous ne collectons aucune donnée personnelle.</div>
          </div>
          <div className="topic">
            <div className="question">Est-ce que je peux ajouter n’importe quelle chanson ?</div>
            <div className="reponse"><strong>Oui !</strong> N'importe quelle chanson disponible sur Spotify ou Deezer.</div>
          </div>
          <div className="topic">
            <div className="question">Ha, alors j'ai besoin d'un compte Spotify ou Deezer ?</div>
            <div className="reponse"><strong>Non !</strong> Aucun compte n'est nécessaire. Tu pourras écouter la chanson que tu découvriras dans ton application Spotify ou Deezer, mais aussi copier le nom de la chanson précedente pour la trouver sur une plateforme de streaming.</div>
          </div>
        </section>
      </div>
      <footer>
        <p>&copy; 2024 Les Boîtes à Groove. Tous droits réservés.</p>
      </footer>
    </>
  );
}

export default HomePage;
