# Comprendre NestJS : injection de dépendances, tokens et `createNestApplication`

> Tout ce document s'appuie sur le code de FBudget, en particulier sur
> `test/auth/auth-email.e2e-spec.ts`.

---

## 1. Le problème que Nest résout

Regarde le constructeur de `UserService` (`src/modules/users/user.service.ts`) :

```ts
constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private settingsService: SettingsService
) { }
```

`UserService` a **besoin** de deux choses pour fonctionner : un repository `User`
et un `SettingsService`. Ce sont ses **dépendances**.

Sans Nest, tu devrais tout fabriquer toi-même, dans le bon ordre :

```ts
const dataSource = new DataSource({ ...config });          // connexion BDD
await dataSource.initialize();
const userRepository = dataSource.getRepository(User);
const settingsRepository = dataSource.getRepository(Settings);
const settingsService = new SettingsService(settingsRepository);
const userService = new UserService(userRepository, settingsService);
const userController = new UserController(userService);
// ... et pareil pour AuthService, MailService, JwtService, etc.
```

C'est long, fragile, et chaque service serait créé plusieurs fois.

**L'injection de dépendances (DI)**, c'est simplement : *« tu déclares ce dont tu
as besoin dans ton constructeur, et quelqu'un d'autre te le fournit »*.
Ce « quelqu'un », c'est **le conteneur de Nest** (aussi appelé *injector*).

---

## 2. Les 3 notions de base

### 2.1 Le provider

Un **provider**, c'est n'importe quoi que Nest sait fabriquer et donner aux autres :
un service, un repository, une config, une valeur...

```ts
@Injectable()          // ← "Nest, tu as le droit de me fabriquer et de m'injecter des choses"
export class SettingsService { ... }
```

### 2.2 Le token (la « clé »)

Le conteneur de Nest, c'est en gros **un grand dictionnaire** :

```
clé (token)                 →  instance
──────────────────────────────────────────────────────
SettingsService             →  l'unique instance de SettingsService
UserService                 →  l'unique instance de UserService
ConfigService               →  l'unique instance de ConfigService
"UserRepository"            →  le Repository<User> de TypeORM
"SettingsRepository"        →  le Repository<Settings> de TypeORM
```

La **clé** s'appelle un **token**. C'est ce que Nest utilise pour savoir *quoi* injecter.

- Pour une classe comme `SettingsService`, **le token est la classe elle-même**.
  C'est pour ça que `private settingsService: SettingsService` suffit :
  TypeScript dit à Nest « le paramètre est de type `SettingsService` », et Nest
  va chercher la clé `SettingsService` dans le dictionnaire.

- Pour un repository, **ça ne marche pas** (voir section 4) : il faut une clé spéciale.

### 2.3 Le module

Un **module** est une boîte qui dit :

```ts
@Module({
    imports:     [...],  // les autres boîtes dont j'ai besoin
    controllers: [...],  // mes routes HTTP
    providers:   [...],  // ce que JE fabrique
    exports:     [...],  // ce que je PARTAGE avec les modules qui m'importent
})
```

Exemple réel, `src/modules/settings/settings.module.ts` :

```ts
@Module({
    imports:   [TypeOrmModule.forFeature([Settings])], // je veux le repository Settings
    providers: [SettingsService],                      // je fabrique SettingsService
    exports:   [SettingsService]                       // et je le partage
})
export class SettingsModule {}
```

Et `src/modules/users/user.module.ts` :

```ts
@Module({
    imports:     [TypeOrmModule.forFeature([User]), SettingsModule],
    controllers: [UserController],
    providers:   [UserService],
})
export class UserModule {}
```

Lecture en français :
> « UserModule fabrique `UserService`. Pour ça, il a besoin du repository `User`
> (fourni par `TypeOrmModule.forFeature([User])`) et de `SettingsService`
> (fourni par `SettingsModule`, qui l'**exporte**). »

⚠️ Si `SettingsModule` n'avait pas `exports: [SettingsService]`, Nest planterait au
démarrage avec la fameuse erreur :
`Nest can't resolve dependencies of the UserService (UserRepository, ?)`.
Le `?` indique la dépendance qu'il n'a pas trouvée.

---

## 3. L'arbre des modules de FBudget

`AppModule` est la racine. Tout part de lui :

```
AppModule
├── ConfigModule.forRoot({ isGlobal: true })   → fournit ConfigService PARTOUT
├── TypeOrmModule.forRootAsync(...)            → ouvre la connexion à la BDD (DataSource)
├── MailerModule.forRootAsync(...)
├── AuthModule
│   ├── JwtModule                              → fournit JwtService
│   ├── TypeOrmModule.forFeature([User])       → fournit le repository User
│   ├── RefreshTokenModule                     → fournit RefreshTokenService
│   ├── SettingsModule                         → fournit SettingsService
│   └── providers: AuthService, GoogleService, MailService
└── UserModule
    ├── TypeOrmModule.forFeature([User])
    ├── SettingsModule
    │   └── TypeOrmModule.forFeature([Settings]) → fournit le repository Settings
    └── providers: UserService
```

Au démarrage, Nest **parcourt cet arbre**, regarde le constructeur de chaque
provider, et les crée dans le bon ordre (d'abord ceux qui n'ont besoin de rien,
puis ceux qui en dépendent). Chaque provider est créé **une seule fois**
(singleton) et réutilisé partout.

> `forRoot` / `forRootAsync` = configuration **globale**, faite une fois (la connexion BDD).
> `forFeature([User])` = « dans ce module-ci, donne-moi accès au repository de `User` ».

---

## 4. Le cas du repository : `@InjectRepository` et `getRepositoryToken`

### Pourquoi on ne peut pas juste écrire `private userRepository: Repository<User>` ?

Parce qu'en TypeScript, **les génériques disparaissent à la compilation**.
Pour Nest, `Repository<User>` et `Repository<Settings>` c'est **la même chose** :
juste `Repository`. Il ne saurait pas lequel te donner.

Donc TypeORM-Nest enregistre chaque repository sous une **clé (token) unique**,
calculée à partir de l'entité. En pratique, c'est une chaîne du genre :

```
getRepositoryToken(User)      →  "UserRepository"
getRepositoryToken(Settings)  →  "SettingsRepository"
```

(La valeur exacte n'a aucune importance : ce qui compte, c'est que c'est
**toujours la même clé** pour la même entité.)

### Les deux faces de la même pièce

| Où                | Code                                  | Rôle                                             |
|-------------------|---------------------------------------|--------------------------------------------------|
| Dans un service   | `@InjectRepository(User)`             | « injecte-moi ce qui est rangé sous la clé du repo User » |
| N'importe où ailleurs (ex : un test) | `getRepositoryToken(User)` | « donne-moi la clé du repo User »                |

En fait, `@InjectRepository(User)` c'est juste un raccourci pour
`@Inject(getRepositoryToken(User))`. Les deux utilisent **la même clé**.

Donc quand tu fais dans le test :

```ts
moduleRef.get<Repository<User>>(getRepositoryToken(User))
```

Tu dis : *« Nest, va dans ton dictionnaire, prends ce qui est rangé à la clé
`UserRepository` »*. Et tu récupères **exactement la même instance** que celle
qui a été injectée dans `UserService` et `AuthService`.

Le `<Repository<User>>` entre chevrons, c'est seulement pour TypeScript (pour
avoir l'autocomplétion). Nest, lui, ne regarde que le token entre parenthèses.

---

## 5. Le test e2e, ligne par ligne

Voici ton fichier `test/auth/auth-email.e2e-spec.ts` :

```ts
describe('POST auth/email', () => {
    let app: INestApplication;
    let settingsRepository: Repository<Settings>;
    let userRepository: Repository<User>;

    beforeAll(async () => {
        // ① On construit le conteneur
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule]
        }).compile()

        // ② On crée l'application HTTP par-dessus
        app = moduleRef.createNestApplication()

        // ③ On pioche des repositories dans le conteneur
        settingsRepository = moduleRef.get<Repository<Settings>>(getRepositoryToken(Settings))
        userRepository = moduleRef.get<Repository<User>>(getRepositoryToken(User))
    })

    afterEach(async () => {
        // ④ On vide la BDD entre chaque test
        await settingsRepository.deleteAll()
        await userRepository.deleteAll()
    })
})
```

### ① `Test.createTestingModule({ imports: [AppModule] }).compile()`

- `createTestingModule(...)` : « je veux un module de test qui contient tout
  `AppModule` ». C'est comme déclarer un `@Module` à la volée.
- Entre `createTestingModule` et `compile`, tu peux **remplacer** des providers.
  C'est ce que tu fais dans `auth-google.e2e-spec.ts` :

  ```ts
  .overrideProvider(GoogleService)     // à la clé GoogleService...
  .useValue(googleServiceMocked)       // ...range plutôt mon faux objet
  ```

  Résultat : quand Nest construit `AuthService`, il lui injecte ton mock au lieu
  du vrai `GoogleService`. `AuthService` n'en sait rien. **C'est tout l'intérêt
  de la DI** : on peut changer une dépendance sans toucher au code qui l'utilise.

- `.compile()` : Nest parcourt l'arbre de modules, crée **tous** les providers,
  ouvre la connexion BDD, etc. Il te rend `moduleRef`, qui est **le conteneur
  rempli** (le grand dictionnaire de la section 2.2).

### ② `moduleRef.createNestApplication()`

`moduleRef` contient tous tes objets, mais **ce n'est pas encore un serveur
web**. Il n'y a pas d'Express, pas de routes, pas de port.

`createNestApplication()` emballe le conteneur dans une **application HTTP**
(Express par défaut). C'est l'équivalent, côté test, de ce que tu fais dans
`src/main.ts` :

```ts
// main.ts (production)
const app = await NestFactory.create(AppModule)   // compile + createNestApplication en un coup
app.useGlobalPipes(new ValidationPipe(...))
await app.listen(3000)                            // ouvre vraiment un port
```

```ts
// test
const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
const app = moduleRef.createNestApplication()
await app.init()                                  // branche les routes, SANS ouvrir de port
```

Pourquoi en deux étapes dans les tests ? Parce que ça te laisse l'occasion de
faire des `overrideProvider` **avant** que l'app soit construite.

Les étapes de vie de l'app :

| Méthode                    | Ce qu'elle fait                                                |
|----------------------------|----------------------------------------------------------------|
| `createNestApplication()`  | crée l'objet app (Express prêt, mais rien de branché)          |
| `app.init()`               | enregistre les routes des controllers, lance les hooks `onModuleInit`. Obligatoire avant de faire des requêtes |
| `app.listen(port)`         | `init()` + ouvre un vrai port. Inutile en test : supertest utilise `app.getHttpServer()` directement |
| `app.close()`              | ferme proprement (connexion BDD comprise)                      |

### ③ `moduleRef.get(getRepositoryToken(...))`

Voir section 4. `moduleRef.get(token)` = « lis la valeur rangée à cette clé ».
Ça marche aussi avec les classes :

```ts
const userService = moduleRef.get(UserService)
const config = moduleRef.get(ConfigService)
```

Tu peux aussi utiliser `app.get(...)`, c'est la même chose.

### ④ `deleteAll()` dans `afterEach`

Comme tu as le **même** repository que celui utilisé par l'app, tu peux
nettoyer la BDD de test entre chaque cas. `Settings` est supprimé avant `User`
à cause de la relation entre les deux tables (clé étrangère).

---

## 6. ⚠️ Ce qui manque dans `auth-email.e2e-spec.ts`

Par rapport à `auth-google.e2e-spec.ts`, il manque deux choses :

```ts
beforeAll(async () => {
    // ...
    await app.init()          // ← sans ça, aucune route n'est branchée : tes requêtes feront 404
})

afterAll(async () => {
    await app.close()         // ← sans ça, la connexion BDD reste ouverte et Jest ne se termine pas
})
```

---

## 7. Résumé en une image

```
  @Module / imports / providers / exports
                 │
                 ▼
   Test.createTestingModule(...)          ← "voici la recette"
                 │  .overrideProvider(X).useValue(mock)   (optionnel)
                 ▼
            .compile()                     ← Nest fabrique tout
                 │
                 ▼
            moduleRef                      ← le conteneur rempli (dictionnaire clé → instance)
            │         │
            │         └── moduleRef.get(getRepositoryToken(User))  → le repo User
            │             moduleRef.get(UserService)               → le service
            ▼
   moduleRef.createNestApplication()       ← on enveloppe le conteneur dans un serveur HTTP
                 │
                 ▼
            app.init()                     ← routes branchées
                 │
                 ▼
   request(app.getHttpServer()).post(...)  ← supertest fait de vraies requêtes
                 │
                 ▼
            app.close()
```

## 8. Les 5 phrases à retenir

1. **Provider** = un objet que Nest sait fabriquer (`@Injectable()`).
2. **Token** = la clé sous laquelle Nest range ce provider. Pour une classe, la clé c'est la classe.
3. **Repository** = pas de classe unique à cause des génériques, donc une clé spéciale :
   `getRepositoryToken(User)`. `@InjectRepository(User)` utilise cette même clé.
4. **`compile()`** construit le conteneur ; **`moduleRef.get(token)`** lit dedans.
5. **`createNestApplication()`** transforme le conteneur en app HTTP ; **`init()`** branche les routes.
