(ns rarousnet.web
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE ANY]]
            [compojure.handler :refer [site]]
            [compojure.route :as route]
            [clojure.java.io :as io]
            [org.httpkit.server :refer [run-server]]
            [ring.middleware.basic-authentication :as basic]
            [ring.middleware.gzip :refer [wrap-gzip]]
            [ring.middleware.stacktrace :refer [wrap-stacktrace]]
            [ring.middleware.session :as session]
            [ring.middleware.session.cookie :as cookie]
            [ring.middleware.reload :refer [wrap-reload]]
            [ring.util.response :as resp]
            [cemerick.drawbridge :as drawbridge]
            [environ.core :refer [env]]
            [rarousnet.home.handler :as home]
            [rarousnet.weblog.handler :as blog]))

(defn- authenticated? [user pass]
  (= [user pass] [(env :repl-user false) (env :repl-password false)]))

(def ^:private drawbridge
  (-> (drawbridge/ring-handler)
      (session/wrap-session)
      (basic/wrap-basic-authentication authenticated?)))

(defroutes app-routes
  home/routes
  blog/routes
  (ANY "/repl" {:as req} (drawbridge req))
  (route/resources "/")
  (ANY "*" [] (route/not-found (slurp (io/resource "404.html")))))

(defn wrap-error-page [handler]
  (fn [req]
    (try (handler req)
      (catch Exception e
        {:status 500
         :headers {"Content-Type" "text/html"}
         :body (slurp (io/resource "500.html"))}))))

(def app
  (let [store (cookie/cookie-store {:key (env :session-secret)})]
    (-> #'app-routes
        ((if (env :production)
           wrap-error-page
           wrap-stacktrace))
        (site {:session {:store store}})
        wrap-gzip)))

(defn -main [& [port]]
  (let [port (Integer. (or port (env :port) 5000))]
    (run-server app {:port port})))

;; For interactive development:
;; (stop)
;; (def stop (-main))
