(ns rarousnet.home.handler
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE ANY]]
            [clojure.java.io :as io]
            [ring.util.response :as resp]
            [enliven.html :as h :refer [static-template content class append prepend style]]
            [enliven.html.jsoup :as jsoup]))

(defn template [name]
  (jsoup/parse (slurp (io/resource (str "home/" name ".html")))))

(defn home-view []
  (h/static-template
    (template "index")))

(defn home []
  (resp/charset {:status 200
                 :headers {"Content-Type" "text/html"}
                 :body (home-view)} "UTF-8"))

(defroutes routes
  (GET "/" [] (home)))
