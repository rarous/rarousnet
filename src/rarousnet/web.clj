(ns rarousnet.web
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE ANY]]
            [compojure.handler :refer [site]]
            [compojure.route :as route]
            [clojure.java.io :as io]
            [ring.middleware.gzip :refer [wrap-gzip]]
            [ring.middleware.stacktrace :as trace]
            [ring.middleware.session :as session]
            [ring.middleware.session.cookie :as cookie]
            [ring.adapter.jetty :as jetty]
            [ring.middleware.basic-authentication :as basic]
            [ring.util.response :as resp]
            [cemerick.drawbridge :as drawbridge]
            [environ.core :refer [env]]
            [rarousnet.home.handler :as home]
            [rarousnet.weblog.handler :as blog]))

(defn- authenticated? [user pass]
  ;; TODO: heroku config:add REPL_USER=[...] REPL_PASSWORD=[...]
  (= [user pass] [(env :repl-user false) (env :repl-password false)]))

(def ^:private drawbridge
  (-> (drawbridge/ring-handler)
      (session/wrap-session)
      (basic/wrap-basic-authentication authenticated?)))

(defroutes app
  home/routes
  blog/routes
  (ANY "/repl" {:as req}
       (drawbridge req))
  (route/resources "/")
  (ANY "*" []
       (route/not-found (slurp (io/resource "404.html")))))

(defn wrap-error-page [handler]
  (fn [req]
    (try (handler req)
      (catch Exception e
        {:status 500
         :headers {"Content-Type" "text/html"}
         :body (slurp (io/resource "500.html"))}))))

(defn -main [& [port]]
  (let [port (Integer. (or port (env :port) 5000))
        ;; TODO: heroku config:add SESSION_SECRET=$RANDOM_16_CHARS
        store (cookie/cookie-store {:key (env :session-secret)})]
    (jetty/run-jetty (-> #'app
                         ((if (env :production)
                            wrap-error-page
                            trace/wrap-stacktrace))
                         (site {:session {:store store}})
                         wrap-gzip)
                     {:port port :join? false})))

;; For interactive development:
;; (.stop server)
;; (def server (-main))
