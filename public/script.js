document.addEventListener("DOMContentLoaded", () => {


	const aiHelperCheckbox = document.getElementById("aiHelper");
    const itemSpecificInput = document.getElementById("itemSpecific");

    aiHelperCheckbox.addEventListener("change", () => {
		const wrapper = itemSpecificInput.closest(".input-wrapper");
		const errorMessage = wrapper?.nextElementSibling; // Assuming the span.error-message is right after
	
		if (aiHelperCheckbox.checked) {
			itemSpecificInput.value = "";
			itemSpecificInput.disabled = true;
			itemSpecificInput.classList.remove("error-border");
			itemSpecificInput.style.borderColor = "";
			wrapper?.classList.remove("error", "valid"); // Remove error and valid states
			if (errorMessage) {
				errorMessage.textContent = ""; // Clear the error message
			}
		} else {
			itemSpecificInput.disabled = false;
		}
	});
	

	const form = document.getElementById("dataForm");
	const fileInput = document.getElementById("blacklist");
	const dropZone = document.getElementById("dropZone");
	const fileNameDisplay = dropZone.querySelector(".file-name");
	const submitButton = form.querySelector('button[type="submit"]');
	const toast = document.getElementById("toast");
	const updateButton = document.getElementById("updateCookieButton");
	const checkStatusButton = document.getElementById("checkStatusButton");

	// File drag and drop handling
	["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
		dropZone.addEventListener(eventName, preventDefaults, false);
	});

	function preventDefaults(e) {
		e.preventDefault();
		e.stopPropagation();
	}

	["dragenter", "dragover"].forEach((eventName) => {
		dropZone.addEventListener(eventName, () => {
			dropZone.classList.add("dragover");
		});
	});

	["dragleave", "drop"].forEach((eventName) => {
		dropZone.addEventListener(eventName, () => {
			dropZone.classList.remove("dragover");
		});
	});

	dropZone.addEventListener("drop", (e) => {
		const files = e.dataTransfer.files;
		if (files.length) {
			fileInput.files = files;
			updateFileName(files[0]);
			validateInput(fileInput);
		}
	});

	// File input change handling
	fileInput.addEventListener("change", (e) => {
		if (e.target.files.length) {
			updateFileName(e.target.files[0]);
			validateInput(fileInput);
		}
	});

	function updateFileName(file) {
		fileNameDisplay.textContent = file
			? file.name
			: "Drag & drop your CSV file or click to browse";
	}

	// Real-time validation
	const inputs = form.querySelectorAll(
		'input[type="text"], input[type="email"]'
	);
	inputs.forEach((input) => {
		input.addEventListener("input", () => validateInput(input));
		input.addEventListener("blur", () => validateInput(input));
	});

	function validateInput(input) {

		if (input.disabled) {
			
			const errorElement = input.closest(".form-group")?.querySelector(".error-message");
			if (errorElement) {
				errorElement.textContent = "";
			}
			return true;
		}
		const wrapper = input.closest(".input-wrapper");
		const errorElement = input.closest(".form-group")?.querySelector(".error-message");
		let isValid = true;
		let errorMessage = "";
	
		if (input.type === "file") {
			const file = input.files[0];
			if (!file) {
				isValid = false;
				errorMessage = "Please select a CSV file";
			} else if (!file.name.toLowerCase().endsWith(".csv")) {
				isValid = false;
				errorMessage = "Please select a valid CSV file";
			}
		} else if (input.type === "email") {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!input.value) {
				isValid = false;
				errorMessage = "Email is required";
			} else if (!emailRegex.test(input.value)) {
				isValid = false;
				errorMessage = "Please enter a valid email address";
			}
		} else {
			if (!input.value.trim()) {
				isValid = false;
				errorMessage = `${input.name} is required`;
			}
		}
	
		if (isValid) {
			input.classList.remove("error");
			wrapper?.classList.add("valid");
		} else {
			input.classList.add("error");
			wrapper?.classList.remove("valid");
		}
	
		if (errorElement) {
			errorElement.textContent = errorMessage;
		}
	
		return isValid;
	}
	

    // Form submission
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Validate all inputs
        const inputs = form.querySelectorAll("input");
        let isValid = true;
        inputs.forEach((input) => {
            if (!validateInput(input)) {
                isValid = false;
            }
        });

        if (!isValid) {
            showToast("Please fill in all required fields correctly", "error");
            return;
        }

        // Prepare form data
        const formData = new FormData();
        formData.append("searchUrl", form.searchUrl.value);
        formData.append("baseUrl", form.baseUrl.value);
        formData.append("itemSpecific", form.itemSpecific.value || ""); // Send empty string if disabled
        formData.append("email", form.email.value);
        formData.append("baseMURL", form.baseMURL.value);
        formData.append("baseYURL", form.baseYURL.value);
        formData.append("blacklist", form.blacklist.files[0]);

        // Append aiHelper field with boolean value (true or false)
        formData.append("aiHelper", aiHelperCheckbox.checked ? "true" : "false");

        try {
            submitButton.classList.add("loading");
            submitButton.disabled = true;

            const response = await fetch("http://localhost:3000/api/submit", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                showToast("Form submitted successfully!", "success");
                form.reset();
                fileNameDisplay.textContent = "Drag & drop your CSV file or click to browse";
                document.querySelectorAll(".input-wrapper.valid").forEach((wrapper) => {
                    wrapper.classList.remove("valid");
                });
            } else {
                throw new Error(result.message || "Submission failed");
            }
        } catch (error) {
            showToast(error.message || "An error occurred. Please try again.", "error");
        } finally {
            submitButton.classList.remove("loading");
            submitButton.disabled = false;
        }
    });

	function showToast(message, type = "success") {
		toast.textContent = message;
		toast.className = `toast ${type} show`;

		setTimeout(() => {
			toast.classList.remove("show");
		}, 3000);
	}

	updateButton.addEventListener("click", () =>
		fetchData("/api/update-cookie", updateButton)
	);
	checkStatusButton.addEventListener("click", () =>
		fetchData("/api/check-status", checkStatusButton)
	);

	async function fetchData(endpoint, button) {
		// Add loading effect
		button.classList.add("loading");
		button.disabled = true;

		try {
			const response = await fetch(endpoint);
			const data = await response.json();

			// Show popup with response
			showPopup(data);
		} catch (error) {
			showPopup({ status: "error", message: "Failed to fetch data" });
		} finally {
			// Remove loading effect
			button.classList.remove("loading");
			button.disabled = false;
		}
	}

	function showPopup(data) {
		const popup = document.createElement("div");
		popup.className = "popup-box";

		// Determine message content
		let content = `
    <div class="popup-content">
      <h2>${data.status === "success" ? "Success" : "Error"}</h2>
      <p>${data.message || "No message available"}</p>
  `;

		// If active users are included, show the count
		
		if (data.activeUsers !== undefined) {
			content += `<p><strong>Active Users:</strong> ${data.activeUsers}</p>`;
		}

		content += `<button class="close-popup">Close</button></div>`;
		popup.innerHTML = content;

		document.body.appendChild(popup);

		// Close popup on button click
		popup.querySelector(".close-popup").addEventListener("click", () => {
			popup.remove();
		});
	}
});
