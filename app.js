const http = require("http");
const url = require("url");

const crypto = require("crypto");
const OAuth = require("oauth-1.0a");

const axios = require("axios");
const querystring = require("querystring");
const open = require("open");

const hostname = "127.0.0.1";
const port = 3000;

const etrade_consumer_key = "<replace with your etrade consumer key>";
const etrade_consumer_secret = "<replace with your etrade consumer secret>"

let request_token; // request token, later exchanged for an access token
let request_token_secret;

let access_token;
let access_token_secret;

const oauth = OAuth({
  consumer: {
    key: etrade_consumer_key,
    secret: etrade_consumer_secret
  },
  signature_method: "HMAC-SHA1",
  hash_function(base_string, key) {
    return crypto.createHmac("sha1", key).update(base_string).digest("base64");
  },
});

const server = http.createServer(async (req, res) => {
  console.log("req.url: ", req.url);

  const parsed_url = url.parse(req.url);

  // check if app has been authorized

  switch (parsed_url.pathname) {
    case "/etrade-authorization":
      await getRequestToken()
        .then(async (response) => {
          console.log(response.data);

          let data = querystring.parse(response.data);
          request_token = data["oauth_token"];
          request_token_secret = data["oauth_token_secret"];

          // Open the Etrade Authentication site in new tab, authorize, then paste in the code.
          res.write(`
          <html> 
      
            <body> 
              
                <p>Click the button to open a new tab </p> 
              
                <button onclick="requestAuth()"> 
                  Authorize Application 
                </button>
              
                <script> 
                    function requestAuth() { 
                        window.open( 
                          "https://us.etrade.com/e/t/etws/authorize?key=${oauth_consumer_key}&token=${request_token}", "_blank"); 
                    } 
                </script>
              
              <form action="/auth-code" method="post">
                <label>Authorization Code:</label>
                <input name="auth_code" type="text" />
                <input type="submit" value="Submit" />
              </form>
            </body> 
              
          </html> 
          `);

          res.end();
        })
        .catch((error) => {
          console.log(error);
        });
      break;

    case "/auth-code":
      if (req.method === "POST") {
        var body = "";
        req.on("data", (data) => {
          body += data;

          if (body.length > 1e6) {
            // too much post data, destroy connection
            req.connection.destroy();
          }
        });
        req.on("end", () => {
          const post = querystring.parse(body);

          getAccessToken(post["auth_code"])
            .then((response) => {
              console.log("getAccessToken::response.data: ", response.data);
              access_obj = querystring.parse(response.data);
              access_token = access_obj["oauth_token"];
              access_token_secret = access_obj["oauth_token_secret"];
              res.writeHead(301, { Location: "/api/accounts/list-accounts" });
              res.end();
            })
            .catch((err) => {
              if (err) {
                res.write(err.data);
                res.end();
              }
            });
        });
      }
      break;

    // Accounts List

    case "/api/accounts/list-accounts":
      listAccounts()
        .then((response) => {
          console.log("**** listAccounts::response: ", response.data);
          const accountsList = JSON.stringify(
            response.data.AccountListResponse.Accounts
          );
          res.write(`
            <html>
              <body>
                <p>/api/accounts/list-accounts
                <p>
                  <code>
                    ${accountsList}
                  </code>
                </p>
              </body>
            </html>
            `);
          res.end();
        })
        .catch((err) => {
          if (err) console.log(err);
        });
      break;

    case "/api/accounts/get-account-balances":
      getAccountBalances("<some accountIdKey>")
        .then((response) => {
          console.log("**** getAccountBalances::response: ", response.data);
          const accountBalances = JSON.stringify(response.data.BalanceResponse);
          res.write(`
            <html>
              <body>
                <p>/accounts/account-balances
                <p>
                  <code>
                    ${accountBalances}
                  </code>
                </p>
              </body>
            </html>
            `);
          res.end();
        })
        .catch((err) => {
          if (err) console.log(err);
        });
      break;

    case "/api/accounts/list-transactions":
      listTransactions("<some accountIdKey>")
        .then((response) => {
          console.log("**** listTransactions::response: ", response.data);
          const transactions = JSON.stringify(response.data);
          res.write(`
            <html>
              <body>
                <p>/accounts/account-balances
                <p>
                  <code>
                    ${transactions}
                  </code>
                </p>
              </body>
            </html>
            `);
          res.end();
        })
        .catch((err) => {
          if (err) console.log(err);
        });
      break;

    case "/api/accounts/list-transaction-details":
      listTransactionDetails("<some tranid>")
        .then((response) => {
          console.log("**** listTransactionDetails::response: ", response.data);
        })
        .catch((err) => {
          if (err) console.log(err);
        });
      break;

    default:
      console.log("default");
      res.end();
  }
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});

//// Authorization

function getRequestToken() {
  const request_data = {
    url: "https://api.etrade.com/oauth/request_token",
    method: "GET",
    data: { oauth_callback: "oob" },
  };
  const request_options = {
    headers: oauth.toHeader(oauth.authorize(request_data)),
  };

  console.log("getRequestToken::request_token: ", request_options);

  return axios.get(
    "https://api.etrade.com/oauth/request_token",
    request_options
  );
}

function getAccessToken(oauth_verifier) {
  const request_data = {
    url: "https://api.etrade.com/oauth/access_token",
    method: "GET",
    data: { oauth_verifier, oauth_token: request_token },
  };
  const token = {
    key: request_token,
    secret: request_token_secret,
  };
  const request_options = {
    headers: oauth.toHeader(oauth.authorize(request_data, token)),
  };

  console.log("getAccessToken::request_options: ", request_options);

  return axios.get(
    "https://api.etrade.com/oauth/access_token",
    request_options
  );
}

// Accounts

function listAccounts() {
  const request_url = "https://apisb.etrade.com/v1/accounts/list";
  const request_data = {
    url: "https://apisb.etrade.com/v1/accounts/list",
    method: "GET",
  };
  const token = {
    key: access_token,
    secret: access_token_secret,
  };
  const request_options = {
    headers: oauth.toHeader(oauth.authorize(request_data, token)),
  };

  console.log("getAccessToken::request_options: ", request_options);

  return axios.get(request_url, request_options);
}

function getAccountBalances(
  accountIdKey,
  accountType = undefined,
  realTimeNAV = undefined
) {
  const request_url = `https://apisb.etrade.com/v1/accounts/${accountIdKey}/balance?instType=BROKERAGE`;

  if (typeof accountType !== "undefined") {
    // expect a string value
    request_url += `&accountType=${accountType}`;
  }

  if (typeof realTimeNAV !== "undefined") {
    // expect a boolean value
    request_url += `&realTimeNAV=${realTimeNAV}`;
  }

  const request_data = {
    url: request_url,
    method: "GET",
  };
  const token = {
    key: access_token,
    secret: access_token_secret,
  };
  const request_options = {
    headers: oauth.toHeader(oauth.authorize(request_data, token)),
  };

  console.log("getAccountBalances::request_options: ", request_options);

  return axios.get(request_url, request_options);
}

function listTransactions(accountIdKey) {
  const request_url = `https://apisb.etrade.com/v1/accounts/${accountIdKey}/transactions`;

  const request_data = {
    url: request_url,
    method: "GET",
  };
  const token = {
    key: access_token,
    secret: access_token_secret,
  };
  const request_options = {
    headers: oauth.toHeader(oauth.authorize(request_data, token)),
  };

  console.log("listTransactions::request_options: ", request_options);

  return axios.get(request_url, request_options);
}

function listTransactionDetails(accountIdKey, tranid) {
  const request_url = `https://apisb.etrade.com/v1/accounts/${accountIdKey}/transactions/${tranid}`;

  const request_data = {
    url: request_url,
    method: "GET",
  };
  const token = {
    key: access_token,
    secret: access_token_secret,
  };
  const request_options = {
    headers: oauth.toHeader(oauth.authorize(request_data, token)),
  };

  console.log("listTransactionDetails::request_options: ", request_options);

  return axios.get(request_url, request_options);
}
