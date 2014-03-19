(ns rarousnet.home.handler
  (:use net.cgrand.enlive-html)
  (:require [compojure.core :refer [defroutes GET ANY]]
            [ring.util.response :refer [charset]]))

(deftemplate home-template "home/index.html" [])
(deftemplate webdesign-template "home/webdesign.html" [])

(defn view [template]
    (apply str (template)))

(defn render [template]
  (-> {:status 200
       :headers {"Content-Type" "text/html"}
       :body (view template)}
      (charset "UTF-8")))

(defn moved-permanently [location]
  {:status 301
   :headers {"Location" location}})

(defn home [] (render home-template))
(defn webdesign [] (render webdesign-template))
(defn redirect-home [] (moved-permanently "/"))
(defn redirect-reference [] (moved-permanently "/webdesign/"))
(defn redirect-texy [] (moved-permanently "http://texy-rarous.rhcloud.com/ws/endpoint.php"))

(defroutes routes
  (GET "/" [] (home))
  (GET "/webdesign/" [] (webdesign))

  (GET "/default.aspx" [] (redirect-home))
  (GET "/Default.aspx" [] (redirect-home))
  (GET "/reference.aspx" [] (redirect-reference))
  (GET "/weblog/reference.aspx" [] (redirect-reference))
  (GET "/weblog/projekty.aspx" [] (redirect-reference))
  (ANY "/texy-ws/endpoint.php" [] (redirect-texy)))
