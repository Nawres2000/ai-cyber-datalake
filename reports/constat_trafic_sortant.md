# Constat de sécurité : trafic sortant du serveur applicatif (notebook 07)

Analyse des flux **sortants** (réseau interne → Internet) de la couche Silver, 8 fichiers, mars 2024 → février 2025. Ce trafic est hors du périmètre du modèle (trafic entrant uniquement).

## Faits mesurés

| # | Constat | Mesure |
|---|---|---|
| 1 | 97 % des flux sortants « positifs » viennent d'une seule règle | 45 016 / 46 279 flux = requêtes DNS de `192.168.33.8` vers OpenDNS (`208.67.222.222`) pour `myip.opendns.com` (« External IP Lookup », sévérité 2) |
| 2 | Tâche planifiée | Première requête le **06/09/2024 à 15:35:01**, puis **toutes les 300 s** (p10 299,4 s ; médiane 300,0 s ; p90 300,4 s) jusqu'au 11/02/2025 |
| 3 | Phase interactive une heure après | 16:35 → 17:10 : appels HTTP à `ifconfig.me`, DNS et TLS vers `api.telegram.org`, DNS direct vers `8.8.8.8` (contournement du résolveur habituel) |
| 4 | Deuxième tâche planifiée | Recherche DNS de l'API Telegram **toutes les 4 h** (20:00, 00:00, 04:00…) du 06/09 au 09/09/2024, puis plus visible |
| 5 | Scan SSH sortant | 24/11/2024 04:34, de `192.168.33.8` vers `13.200.41.135:22` |
| 6 | Pas de réponse à des attaquants | 0 des 15 IP de destination n'apparaît en trafic entrant : le serveur initie les connexions |
| 7 | Reste du trafic sortant sain | ≈ 1 200 flux de mises à jour APT vers les miroirs Ubuntu (Canonical), labellisés 0 |

## Vecteurs d'intrusion vérifiés et écartés

- **WordPress** : les 292 `POST /wp-login.php` du 3 au 6 septembre renvoient **404** (ou pas de réponse), et tous les accès `/wp-admin` aussi : WordPress n'est pas installé. Les alertes « Cleartext WordPress Login » sont des tentatives de robots, sans succès possible.
- **Exploitation web réussie** : aucune alerte `ATTACK_RESPONSE` en septembre 2024 (les seules sont en mars, avril, juin, juillet et novembre). Les tentatives d'exploitation des 72 h précédentes (injection de commandes, path traversal Apache, ThinkPHP…) relèvent du bruit de fond observé toute l'année.
- **Alerte « ET COMPROMISED » proche de 15:35** : ce sont des connexions **entrantes** d'IP de réputation douteuse (ex. `185.191.126.213` sur le port 80, `5.135.90.165` et `139.99.176.118` sur le port 22), présentes plusieurs fois par jour ; elles ne montrent pas que le serveur est compromis.

## Interprétation

Le schéma « phase interactive → vérification de l'IP publique → contact de l'API Telegram → tâches cron à intervalle fixe » correspond à un **programme qui signale son adresse via un bot Telegram**. Deux hypothèses restent compatibles avec les données réseau :

1. **Légitime** : un administrateur installe le 6 septembre un script de DNS dynamique ou de supervision avec notifications Telegram.
2. **Compromission** : un implant (backdoor, mineur) installé sur `192.168.33.8`, qui utilise Telegram comme canal de contrôle ; le contournement DNS vers `8.8.8.8` et le scan SSH sortant de novembre vont dans ce sens.

Aucun vecteur d'intrusion n'est visible dans les alertes Suricata ; SSH (port 22, exposé via le proxy) reste possible mais son contenu est chiffré. **Les données réseau ne permettent pas de trancher : c'est un indicateur de compromission à investiguer, pas une preuve.**

## Recommandations

- **Investigation sur `192.168.33.8`** : `crontab -l` de tous les utilisateurs, `/etc/cron*`, timers systemd, fichiers créés ou modifiés le 06/09/2024 entre 15:00 et 17:30, historiques shell, connexions SSH dans `auth.log` ce jour-là, jetons ou scripts Telegram.
- **Surveillance du trafic sortant** : le système actuel (trafic entrant) ne voit pas ce signal. Ajouter des règles comportementales : périodicité stricte, services de recherche d'IP publique, API de messageries, DNS hors du résolveur autorisé.
- **Qualité du label** : une règle de politique de sévérité 2 suffit à produire 45 000 « positifs » ; le label v1 confond comportement à vérifier et attaque.
