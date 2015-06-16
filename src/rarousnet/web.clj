(ns rarousnet.web
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :refer [error]]
            [compojure.core :refer [defroutes GET PUT POST DELETE ANY]]
            [compojure.handler :refer [site]]
            [compojure.route :as route]
            [optimus.prime :as optimus]
            [optimus.assets :as assets]
            [optimus.optimizations :as optimizations]
            [optimus.strategies :as strategies]
            [org.httpkit.server :refer [run-server]]
            [ring.middleware.basic-authentication :as basic]
            [ring.middleware.defaults :refer [wrap-defaults site-defaults]]
            [ring.middleware.etag.core :as etag]
            [ring.middleware.gzip :refer [wrap-gzip]]
            [ring.middleware.stacktrace :refer [wrap-stacktrace]]
            [ring.middleware.reload :refer [wrap-reload]]
            [ring.util.response :as resp]
            [environ.core :refer [env]]
            [rarousnet.home.handler :as home]
            [rarousnet.weblog.handler :as blog]))

(defroutes app-routes
  home/routes
  blog/routes
  (GET "/500" [] (Exception. "500"))
  (route/resources "/")
  (ANY "*" [] (route/not-found (slurp (io/resource "404.html")))))

(defn- get-assets []
  (concat
   (assets/load-bundle "public" "weblog.js" ["/assets/js/prism.js"])
   (assets/load-bundle "public" "weblog.css" ["/design/blog/blog.css"])
   (assets/load-assets "public"
                       ["/assets/bg.png"
                        "/assets/logo.svg"
                        "/favicon.ico"
                        "/design/blog/favicon.png"])))

(def optimization
  (if (env :production)
    optimizations/all
    optimizations/none))

(def strategy
  (if (env :production)
    strategies/serve-frozen-assets
    strategies/serve-live-assets))

(def create-md5-etag (etag/create-hashed-etag-fn etag/md5))

(defn- wrap-error-page [handler]
  (fn [req]
    (try
      (handler req)
      (catch Exception ex
        (error ex (str "Error in execution of page " (:uri req)))
        {:status 500
         :headers {"Content-Type" "text/html"}
         :body (slurp (io/resource "500.html"))}))))

(def app
  (-> #'app-routes
      ((if (env :production)
         wrap-error-page
         wrap-stacktrace))
      (optimus/wrap get-assets optimization strategy)
      #_(etag/with-etag {:etag-generator create-md5-etag})
      (wrap-defaults site-defaults)
      wrap-gzip))

(defn -main [& [port]]
  (let [port (Integer. (or port (env :port) 5000))]
    (run-server app {:port port})
    (println (str "Web server is running on port " port))))

;; For interactive development:
;; (stop)
;; (def stop (-main))
