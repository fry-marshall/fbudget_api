# Comprendre Swagger dans Nest : `applyDecorators`, `ApiExtraModels` et `ApiSuccessResponse`

> Tout ce document s'appuie sur le code de FBudget, en particulier sur
> `src/common/swagger/api-responses.decorator.ts` et
> `src/common/interceptors/response.interceptor.ts`.

---

## 1. Le problème : Swagger ne voit pas l'interceptor

Regarde `getMe` dans `UserController` :

```ts
@Get('me')
getMe(@CurrentUser() user: PayloadJwt): Promise<UserResponseDto> {
    return this.userService.getMe(user.id!);
}
```

Le controller renvoie un `UserResponseDto`. Mais avant de partir vers le client,
la réponse passe par le `ResponseInterceptor` :

```ts
map((value: T) => ({
    data: value,
    statusCode
}))
```

Le JSON réellement reçu par l'app mobile est donc :

```json
{
  "statusCode": 200,
  "data": { "id": "…", "email": "john@example.com", "settings": { … } }
}
```

Swagger, lui, ne lit que les **décorateurs** posés sur la méthode. Il ne sait
rien de l'interceptor. Avec un simple `@ApiOkResponse({ type: UserResponseDto })`,
la doc annoncerait :

```json
{ "id": "…", "email": "john@example.com", "settings": { … } }
```

C'est faux : il manque l'enveloppe `{ statusCode, data }`. Un dev front qui génère
son client à partir de la doc se tromperait de forme.

`ApiSuccessResponse` existe pour **décrire l'enveloppe à la main**, une fois pour
toutes.

---

## 2. Rappel : un décorateur, c'est juste une fonction

```ts
@ApiResponse({ status: 200, description: 'Success' })
getMe() { … }
```

`ApiResponse({ … })` est un appel de fonction normal. Il **renvoie** une fonction
(le vrai décorateur) que TypeScript applique à la méthode `getMe` au chargement
de la classe.

Les décorateurs Swagger ne changent **rien** au comportement de la méthode. Ils
écrivent seulement des **métadonnées** dessus (via `Reflect.defineMetadata`),
un peu comme des post-it collés sur la méthode :

```
getMe
 ├── post-it "swagger/apiResponse" : { 200: { description: 'Success', … } }
 └── post-it "swagger/apiOperation" : { summary: '…' }
```

Plus tard, dans `main.ts`, `SwaggerModule.createDocument(app, …)` parcourt
tous les controllers, **lit ces post-it** et fabrique le JSON OpenAPI servi
sur `/api/docs-json` (et affiché sur `/api/docs`).

---

## 3. `applyDecorators` : regrouper plusieurs décorateurs en un

Sans `applyDecorators`, documenter un succès demanderait d'empiler à chaque fois :

```ts
@ApiExtraModels(UserResponseDto)
@ApiResponse({ status: 200, description: 'Success', schema: { … 10 lignes … } })
getMe() { … }
```

`applyDecorators` (fourni par `@nestjs/common`) prend une liste de décorateurs
et renvoie **un seul** décorateur qui les applique tous :

```ts
export const ApiSuccessResponse = (…) =>
    applyDecorators(
        ApiExtraModels(dataType),   // décorateur n°1
        ApiResponse({ … }),         // décorateur n°2
    );
```

Donc ces deux écritures sont **strictement équivalentes** :

```ts
@ApiSuccessResponse(UserResponseDto)
```

```ts
@ApiExtraModels(UserResponseDto)
@ApiResponse({ status: 200, description: 'Success', schema: { … } })
```

C'est de la **composition** : on fabrique nos propres décorateurs à partir de ceux
de Nest, comme on extrait une fonction pour ne pas dupliquer du code.

---

## 4. La signature, morceau par morceau

```ts
export const ApiSuccessResponse = <T extends new (...args: any[]) => any>(
    dataType: T,
    statusCode: 200 | 201 = 200,
    description = 'Success',
) => …
```

### 4.1 `<T extends new (...args: any[]) => any>`

C'est un **générique** : `T` est un type qu'on ne connaît pas encore.
La contrainte `extends new (...args: any[]) => any` veut dire :
*« T doit être quelque chose qu'on peut appeler avec `new` »*, autrement dit
**une classe**.

```ts
ApiSuccessResponse(UserResponseDto)        // ✅ UserResponseDto est une classe
ApiSuccessResponse(new UserResponseDto())  // ❌ une instance, pas une classe
ApiSuccessResponse('UserResponseDto')      // ❌ une chaîne
```

Pourquoi une classe ? Parce que Swagger a besoin de lire les `@ApiProperty`
posés sur les champs de la classe pour construire son schéma. Ces métadonnées
sont attachées à la **classe**, pas à une instance.

> Une interface TypeScript ne marcherait pas non plus : les interfaces
> disparaissent à la compilation, il n'en reste rien au runtime pour Swagger.
> C'est pour ça que les DTOs sont des `class`.

### 4.2 `statusCode: 200 | 201 = 200`

- `200 | 201` : seules ces deux valeurs sont acceptées (un `POST` renvoie 201
  par défaut dans Nest, le reste 200).
- `= 200` : valeur par défaut. `@ApiSuccessResponse(UserResponseDto)` documente
  donc un 200, `@ApiSuccessResponse(AuthResponseDto, 201)` un 201.

### 4.3 `description = 'Success'`

Texte affiché à côté du code HTTP dans l'interface Swagger. Le type `string`
est déduit de la valeur par défaut.

---

## 5. `ApiExtraModels(dataType)` : enregistrer le DTO

Le JSON OpenAPI a une section `components.schemas` qui sert de **catalogue** :
chaque DTO y est décrit une seule fois, et le reste de la doc y fait référence.

```json
"components": {
  "schemas": {
    "UserResponseDto": { "type": "object", "properties": { "id": …, "email": … } },
    "SettingsResponseDto": { … }
  }
}
```

Normalement, Swagger ajoute un DTO au catalogue quand il le croise via
`type: UserResponseDto` (dans `@ApiOkResponse({ type })`, dans un `@Body()`, etc.).

Ici, on n'utilise **pas** `type:` : on écrit un `schema` brut à la main (section 6).
Swagger ne « voit » donc jamais `UserResponseDto` et ne l'ajouterait pas au
catalogue. La référence `$ref` pointerait vers un schéma qui n'existe pas, et la
doc afficherait une erreur de résolution.

`ApiExtraModels(UserResponseDto)` dit explicitement :
*« ajoute cette classe au catalogue, même si tu ne la croises nulle part ailleurs »*.

---

## 6. `ApiResponse({ schema })` : décrire l'enveloppe à la main

```ts
ApiResponse({
    status: statusCode,
    description,
    schema: {
        properties: {
            statusCode: { type: 'number', example: statusCode },
            data: { $ref: getSchemaPath(dataType) },
        },
    },
}),
```

`schema` est écrit directement en **JSON Schema** (le format qu'utilise OpenAPI).
Il décrit un objet avec deux propriétés, exactement la forme produite par le
`ResponseInterceptor` :

| Propriété | Schéma | Signification |
|---|---|---|
| `statusCode` | `{ type: 'number', example: 200 }` | un nombre, montré avec l'exemple 200 (ou 201) |
| `data` | `{ $ref: … }` | « va voir la définition du DTO dans le catalogue » |

### `getSchemaPath(dataType)`

C'est un simple utilitaire qui renvoie le chemin vers le DTO dans le catalogue :

```ts
getSchemaPath(UserResponseDto)
// → '#/components/schemas/UserResponseDto'
```

`$ref` est le mécanisme standard d'OpenAPI pour dire *« ici, insère le schéma
défini là-bas »*. On ne recopie pas la description du DTO, on y fait référence.

---

## 7. Le résultat dans le JSON OpenAPI

Avec :

```ts
@Get('me')
@ApiSuccessResponse(UserResponseDto)
getMe() { … }
```

`/api/docs-json` contient :

```json
"/api/v1/users/me": {
  "get": {
    "responses": {
      "200": {
        "description": "Success",
        "content": {
          "application/json": {
            "schema": {
              "properties": {
                "statusCode": { "type": "number", "example": 200 },
                "data": { "$ref": "#/components/schemas/UserResponseDto" }
              }
            }
          }
        }
      }
    }
  }
},
…
"components": {
  "schemas": {
    "UserResponseDto": { … }   // ← présent grâce à ApiExtraModels
  }
}
```

Et l'interface `/api/docs` affiche l'exemple de réponse **avec** l'enveloppe,
conforme à ce que l'API renvoie vraiment.

---

## 8. Récapitulatif

```
@ApiSuccessResponse(UserResponseDto)
        │
        └─ applyDecorators(…)                → applique les 2 décorateurs suivants
              ├─ ApiExtraModels(UserResponseDto)
              │     → ajoute UserResponseDto au catalogue components.schemas
              └─ ApiResponse({ status: 200, schema })
                    → décrit { statusCode: number, data: $ref → UserResponseDto }

Au démarrage : SwaggerModule.createDocument() lit ces métadonnées → JSON OpenAPI
```

---

## 9. Limites actuelles (à garder en tête)

- **Listes** : `data` est toujours **un** objet. Pour un `GET /accounts` qui renvoie
  un tableau, il faudra une variante qui produit
  `data: { type: 'array', items: { $ref: … } }`.
- **Champs du DTO** : un champ n'apparaît dans le schéma que s'il porte un
  `@ApiProperty` (ou si le plugin CLI de Swagger est activé, ce qui n'est pas le
  cas ici). Un DTO sans décorateurs donnera un objet vide dans la doc.
- **DTO imbriqué** : pour un champ dont le type est un autre DTO (comme
  `settings: SettingsResponseDto`), il faut préciser `@ApiProperty({ type: SettingsResponseDto })`,
  sinon Swagger ne sait pas quoi afficher.
- **Erreurs** : `ApiSuccessResponse` ne documente que le succès. Les erreurs se
  documentent à part, avec `@ApiBadRequestResponse({ type: ErrorResponse })`, etc.
