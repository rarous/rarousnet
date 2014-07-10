(ns rarousnet.web
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE ANY]]
            [compojure.handler :refer [site]]
            [compojure.route :as route]
            [clojure.java.io :as io]
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
  (route/resources "/")
  (ANY "*" [] (route/not-found (slurp (io/resource "404.html")))))

(defn- get-assets []
  (concat
   (assets/load-bundle "public" "weblog.js" ["/assets/js/prism.js"])
   (assets/load-bundle "public" "weblog.css" ["/design/blog/blog.css"])
   (assets/load-assets "public"
                       ["/bg.png"
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
      (catch Exception e
        {:status 500
         :headers {"Content-Type" "text/html"}
         :body (slurp (io/resource "500.html"))}))))

(def app
  (-> #'app-routes
      (etag/with-etag {:etag-generator create-md5-etag})
      ((if (env :production)
         wrap-error-page
         wrap-stacktrace))
      (optimus/wrap get-assets optimization strategy)
      (wrap-defaults site-defaults)
      wrap-gzip))

(defn -main [& [port]]
  (let [port (Integer. (or port (env :port) 5000))]
    (run-server app {:port port})))

;; For interactive development:
;; (stop)
;; (def stop (-main))
