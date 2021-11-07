[@uteamjs/node](https://u.team/document/uteam-node/overview) is a backend [RESTful API](https://u.team/document/uteam-node/api) framework built on top of the **Node.js** and **Express.js** ecosystem. It can be deployed alone or together with frontend [@uteamjs/react](https://u.team/document/uteam-react/overview) framework.  It is not required to set up any API endpoint in **Express.js**.  You simply put the backend functions in standard **node_modules** component structure.  This helps to simplify the deployment and management of  complex enterprise applications.

# Features
- Auto API endpoint routing
- Hot loading module
- Simplify database access
- Stateless API with JWT authentication
- Advanced flow control
- Integrate with [@uteamjs/react](https://u.team/document/uteam-react/overview)

# Installation
[uteam CLI](https://u.team/document/uteam-react/overview) helps you automate the creation, deletion and generation of application modules and packages.
```
$ npm install -g uteam
```
Use **uteam create** to create **Node.js** application based on [@uteamjs/node](https://u.team/document/uteam-node/overview) framework:
```
$ uteam create -a tutorial-node -t node-application

```
Change to __...packages/main__ folder, then start the  server:
```
$ node server
```

Refer to [CRUD Api tutorial](https://u.team/document/tutorial/crudapi) for more details.

# Exmaple
In this following example, the name of the reducer **‘crud-api/contact’** defines the  \<package>/\<component> destination.
```jsx    
const reducer = utReducer('crud-api/contact', {
   actions: {
       ...
       load: (_, payload) => _.rows = payload.rows
   }
})

class layout extends utform {
   constructor(props) {
       ...
       props.api('load', {})
   }
   ...
}
```
In the server you need to create a **contact.js** file under the following folder structure:
```
/<project_folder>/your-application/
    ...
    packages/
        crud-api/
            contact.js
            ...
```
Under the **contact.js** file, add the load function:
```jsx
const { sqlseries, capitalize } = require('@uteamjs/node')

exports.load = sqlseries((db, payload) => [
   db.query('select * from contact', rows => {
       rows.forEach(t => t.gender = capitalize(t.gender))
       payload.rows = rows
   })
])
```
The frontend [props.api('load', {})](https://u.team/document/uteam-react/callapi#api) function will be routed to the backend **export.load** function automatically.  

After you execute the query, assign the result rows to the payload object.  

Corresponding frontend layout:
```jsx
class layout extends _layout {
   constructor(props) {
       super(props)
       props.api('load', {})
   }

   render = () => this.Content()
}
```

# License
[MIT](LICENSE)
