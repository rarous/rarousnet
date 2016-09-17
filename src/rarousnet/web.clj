(ns rarousnet.web
  (:require
    [clojure.java.io :as io]
    [clojure.tools.logging :as log]
    [compojure.core :refer [defroutes GET ANY]]
    [compojure.route :as route]
    [org.httpkit.server :refer [run-server]]
    [ring.middleware.defaults :refer [wrap-defaults site-defaults]]
    [ring.middleware.stacktrace :refer [wrap-stacktrace]]
    [environ.core :refer [env]]
    [rarousnet.home.handler :as home]
    [rarousnet.weblog.handler :as blog])
  (:gen-class))

(defroutes app-routes
  home/routes
  blog/routes
  (GET "/500" [] (Exception. "500"))
  (route/resources "/")
  (ANY "*" [] (route/not-found (slurp (io/resource "404.html")))))

(defn- wrap-error-page [handler]
  (fn [req]
    (try
      (handler req)
      (catch Exception ex
        (log/error ex (str "Error in execution of page " (:uri req)))
        {:status 500
         :headers {"Content-Type" "text/html"}
         :body (slurp (io/resource "500.html"))}))))

(def app
  (-> #'app-routes
      ((if (env :production)
         wrap-error-page
         wrap-stacktrace))
      (wrap-defaults site-defaults)))

(defn -main [& [port]]
  (let [port (Integer. (or port (env :port) 5000))]
    (run-server app {:port port})
    (println (str "Web server is running on http://localhost:" port))))

