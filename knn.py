from sklearn.neighbors import KNeighborsClassifier

# Scale features for KNN
scaler_knn = StandardScaler()
X_train_scaled_knn = scaler_knn.fit_transform(X_train)
X_test_scaled_knn = scaler_knn.transform(X_test)

# Initialize and train KNN
knn = KNeighborsClassifier(n_neighbors=5)  # You can change k here
knn.fit(X_train_scaled_knn, y_train)
y_pred_knn = knn.predict(X_test_scaled_knn)
metrics_results_knn = {
    "accuracy": accuracy_score(y_test, y_pred_knn),
    "precision": precision_score(y_test, y_pred_knn, average='weighted'),
    "recall": recall_score(y_test, y_pred_knn, average='weighted'),
    "f1_score": f1_score(y_test, y_pred_knn, average='weighted')
}

print("KNN Classification Report:")
print(classification_report(y_test, y_pred_knn))
cm_knn = confusion_matrix(y_test, y_pred_knn)
disp_knn = ConfusionMatrixDisplay(confusion_matrix=cm_knn)
disp_knn.plot(cmap=plt.cm.Blues)
plt.title("Confusion Matrix KNN in AI ML")
plt.show()